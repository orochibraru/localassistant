import { dirname, join } from "node:path";

import { configuration } from "#lib/server/core/config.js";
import { Logger } from "#lib/server/core/logger.js";
import {
	type WorkerConfigMessage,
	workerMessages,
} from "#lib/server/worker/messages.js";

const logger = new Logger("WorkerProcess");

const maxRestartDelayMs = 30_000;
const stableUptimeMs = 60_000;

export type SpawnWorker = (
	command: string[],
	onExit: (code: number | null) => void,
) => { kill: () => void };

const spawnWithBun: SpawnWorker = (command, onExit) => {
	const child = Bun.spawn(command, {
		stdout: "inherit",
		stderr: "inherit",
		serialization: "json",
		ipc: (message, subprocess) => {
			if (workerMessages.isReady(message)) {
				subprocess.send({
					type: "config",
					config: configuration.get(),
				} satisfies WorkerConfigMessage);
			}
		},
		onExit: (_process, code) => onExit(code),
	});
	return { kill: () => child.kill("SIGTERM") };
};

/** Runs the worker process and restarts it with backoff whenever it exits. */
export class WorkerSupervisor {
	readonly #command: string[];
	readonly #spawn: SpawnWorker;
	#child: ReturnType<SpawnWorker> | undefined;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#delayMs = 500;
	#stopping = false;

	/** The command that runs the worker: its TypeScript source under watch in dev, the compiled binary next to the server otherwise. */
	static command(isDev: boolean): string[] {
		if (isDev) {
			return [process.execPath, "--watch", "src/worker/index.ts"];
		}
		return [join(dirname(process.execPath), "worker")];
	}

	/** The delay before the next restart: reset after a stable run, doubled up to a cap after a crash loop. */
	static nextRestartDelay(previousMs: number, uptimeMs: number): number {
		return uptimeMs > stableUptimeMs
			? 1000
			: Math.min(previousMs * 2, maxRestartDelayMs);
	}

	/** Prepares a supervisor for `command`; nothing runs until `start()`. */
	constructor(command: string[], spawn: SpawnWorker = spawnWithBun) {
		this.#command = command;
		this.#spawn = spawn;
	}

	/** Spawns the worker and keeps it alive, restarting it with backoff when it exits. */
	start(): void {
		const startedAt = Date.now();
		try {
			this.#child = this.#spawn(this.#command, (code) => {
				if (!this.#stopping) {
					this.#scheduleRestart(startedAt, `Worker exited with code ${code}`);
				}
			});
			logger.info("Worker started", { command: this.#command.join(" ") });
		} catch (error) {
			this.#scheduleRestart(startedAt, "Could not start the worker", error);
		}
	}

	/** Stops restarting and sends SIGTERM to the running worker; safe to call more than once. */
	stop(): void {
		if (this.#stopping) {
			return;
		}
		this.#stopping = true;
		clearTimeout(this.#timer);
		this.#child?.kill();
	}

	/** Logs why the worker stopped and starts it again after the next backoff delay. */
	#scheduleRestart(startedAt: number, reason: string, error?: unknown): void {
		this.#delayMs = WorkerSupervisor.nextRestartDelay(
			this.#delayMs,
			Date.now() - startedAt,
		);
		logger.warn(
			`${reason}, restarting in ${this.#delayMs}ms`,
			...(error ? [error] : []),
		);
		this.#timer = setTimeout(() => this.start(), this.#delayMs);
	}
}
