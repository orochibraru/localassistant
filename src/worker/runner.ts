import { JobDTO } from "#lib/dto/job.js";
import { Logger } from "#lib/server/core/logger.js";
import type { JobHandlers } from "#lib/server/jobs/handlers.js";

const logger = new Logger("Worker");

export interface RunnerOptions {
	concurrency: number;
	pollIntervalMs: number;
	handlers: JobHandlers;
	isParentAlive?: () => boolean;
}

export class JobRunner {
	readonly #options: RunnerOptions;
	readonly #running = new Set<Promise<void>>();
	#stopping = false;

	/** Prepares a runner; nothing is claimed until `run()`. */
	constructor(options: RunnerOptions) {
		this.#options = options;
	}

	/** Claims and processes due jobs until `stop()` is called or the parent server dies, then waits for in-flight jobs. */
	async run(): Promise<void> {
		while (!this.#stopping) {
			if (this.#options.isParentAlive && !this.#options.isParentAlive()) {
				logger.warn("Parent server is gone, stopping");
				break;
			}
			this.tick();
			await Bun.sleep(this.#options.pollIntervalMs);
		}
		await Promise.all(this.#running);
	}

	/** Starts as many due jobs as free slots allow, without waiting for them. */
	tick(): void {
		while (this.#running.size < this.#options.concurrency) {
			const job = this.#claim();
			if (!job) {
				return;
			}
			const execution = this.process(job).finally(() =>
				this.#running.delete(execution),
			);
			this.#running.add(execution);
		}
	}

	/** Runs one claimed job through its handler and records the outcome; never throws. */
	async process(job: JobDTO): Promise<void> {
		const startedAt = performance.now();
		try {
			const handler = this.#options.handlers[job.type] as
				((payload: unknown) => void | Promise<void>) | undefined;
			if (!handler) {
				throw new Error(`No handler for job type ${job.type}`);
			}
			await handler(job.payload);
			job.complete();
			logger.debug("Job done", {
				id: job.id,
				type: job.type,
				durationMs: Math.round(performance.now() - startedAt),
			});
		} catch (error) {
			logger.error("Job failed", { id: job.id, type: job.type }, error);
			try {
				job.fail(error);
			} catch (recordError) {
				logger.error(
					"Could not record the job failure",
					{ id: job.id },
					recordError,
				);
			}
		}
	}

	/** Asks `run()` to return once in-flight jobs finish. */
	stop(): void {
		this.#stopping = true;
	}

	#claim(): JobDTO | undefined {
		try {
			return JobDTO.claimNext();
		} catch (error) {
			logger.error("Could not claim a job", error);
			return undefined;
		}
	}
}
