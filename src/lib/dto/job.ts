import { and, asc, count, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { job } from "#lib/server/db/schema.js";
import type { JobPayloads, JobType } from "#lib/server/jobs/types.js";

export type JobRow = typeof job.$inferSelect;

export interface EnqueueOptions {
	runAt?: Date;
	maxAttempts?: number;
}

const retryBaseDelayMs = 5000;

export class JobDTO extends BaseDTO<JobRow> {
	/** Queues a job for the worker. */
	static enqueue<Type extends JobType>(
		type: Type,
		payload: JobPayloads[Type],
		options: EnqueueOptions = {},
	): JobDTO {
		const row = databaseConnection
			.get()
			.insert(job)
			.values({
				type,
				payload,
				runAt: options.runAt,
				maxAttempts: options.maxAttempts,
			})
			.returning()
			.get();
		return new JobDTO(row);
	}

	/** Whether a job of `type` is already waiting or running. */
	static isQueued(type: JobType): boolean {
		const row = databaseConnection
			.get()
			.select({ id: job.id })
			.from(job)
			.where(
				and(eq(job.type, type), inArray(job.status, ["pending", "running"])),
			)
			.get();
		return row !== undefined;
	}

	/** Atomically marks the oldest due pending job as running and returns it, or `undefined` when none is due. */
	static claimNext(now = new Date()): JobDTO | undefined {
		const database = databaseConnection.get();
		const due = database
			.select({ id: job.id })
			.from(job)
			.where(and(eq(job.status, "pending"), lte(job.runAt, now)))
			.orderBy(asc(job.runAt), asc(job.id))
			.limit(1);
		const row = database
			.update(job)
			.set({
				status: "running",
				attempts: sql`${job.attempts} + 1`,
				lockedAt: now,
			})
			.where(and(eq(job.status, "pending"), inArray(job.id, due)))
			.returning()
			.get();
		return row ? new JobDTO(row) : undefined;
	}

	/** Puts jobs left running by a crashed worker back in the queue. */
	static requeueStale(): number {
		return databaseConnection
			.get()
			.update(job)
			.set({ status: "pending", lockedAt: null })
			.where(eq(job.status, "running"))
			.returning({ id: job.id })
			.all().length;
	}

	/** Deletes finished jobs older than `before`. */
	static pruneFinished(before: Date): number {
		return databaseConnection
			.get()
			.delete(job)
			.where(
				and(
					inArray(job.status, ["done", "failed"]),
					lt(job.finishedAt, before),
				),
			)
			.returning({ id: job.id })
			.all().length;
	}

	/** When the next waiting job of `type` is due, if one waits. */
	static nextRun(type: JobType): Date | undefined {
		return databaseConnection
			.get()
			.select({ runAt: job.runAt })
			.from(job)
			.where(and(eq(job.type, type), eq(job.status, "pending")))
			.orderBy(asc(job.runAt))
			.get()?.runAt;
	}

	/** How many jobs sit in each status. */
	static counts(): Record<JobRow["status"], number> {
		const totals = { pending: 0, running: 0, done: 0, failed: 0 };
		for (const row of databaseConnection
			.get()
			.select({ status: job.status, total: count() })
			.from(job)
			.groupBy(job.status)
			.all()) {
			totals[row.status] = row.total;
		}
		return totals;
	}

	/** The latest jobs that failed for good, newest first. */
	static recentFailures(
		limit = 5,
	): Pick<JobRow, "id" | "type" | "lastError" | "finishedAt">[] {
		return databaseConnection
			.get()
			.select({
				id: job.id,
				type: job.type,
				lastError: job.lastError,
				finishedAt: job.finishedAt,
			})
			.from(job)
			.where(eq(job.status, "failed"))
			.orderBy(desc(job.finishedAt))
			.limit(limit)
			.all();
	}

	get id(): number {
		return this.row.id;
	}

	get type(): JobType {
		return this.row.type as JobType;
	}

	get payload(): unknown {
		return this.row.payload;
	}

	/** Marks the job done. */
	complete(): void {
		databaseConnection
			.get()
			.update(job)
			.set({ status: "done", finishedAt: new Date(), lastError: null })
			.where(eq(job.id, this.row.id))
			.run();
	}

	/** Records a failed attempt: back to pending with exponential backoff, or failed for good once out of attempts. */
	fail(error: unknown, now = new Date()): void {
		const message = error instanceof Error ? error.message : String(error);
		const exhausted = this.row.attempts >= this.row.maxAttempts;
		databaseConnection
			.get()
			.update(job)
			.set(
				exhausted
					? { status: "failed", finishedAt: now, lastError: message }
					: {
							status: "pending",
							lockedAt: null,
							lastError: message,
							runAt: new Date(
								now.getTime() + retryBaseDelayMs * 2 ** (this.row.attempts - 1),
							),
						},
			)
			.where(eq(job.id, this.row.id))
			.run();
	}
}
