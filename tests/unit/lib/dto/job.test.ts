import { beforeEach, describe, expect, test } from "bun:test";

import { JobDTO } from "#lib/dto/job.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { job } from "#lib/server/db/schema.js";

import { resetDatabase } from "../../database.js";

const payload = { olderThanDays: 7 };

function rowOf(id: number) {
	return databaseConnection
		.get()
		.select()
		.from(job)
		.all()
		.find((row) => row.id === id);
}

describe("JobDTO", () => {
	beforeEach(resetDatabase);

	test("claimNext takes the oldest due job once", () => {
		const first = JobDTO.enqueue("jobs.prune", payload);
		JobDTO.enqueue("jobs.prune", payload, {
			runAt: new Date(Date.now() + 60_000),
		});
		const claimed = JobDTO.claimNext();
		expect(claimed?.id).toBe(first.id);
		expect(claimed?.type).toBe("jobs.prune");
		expect(claimed?.payload).toEqual(payload);
		expect(JobDTO.claimNext()).toBeUndefined();
	});

	test("isQueued sees pending and running jobs", () => {
		expect(JobDTO.isQueued("jobs.prune")).toBe(false);
		JobDTO.enqueue("jobs.prune", payload);
		expect(JobDTO.isQueued("jobs.prune")).toBe(true);
		JobDTO.claimNext()?.complete();
		expect(JobDTO.isQueued("jobs.prune")).toBe(false);
	});

	test("fail retries with backoff, then gives up", () => {
		const queued = JobDTO.enqueue("jobs.prune", payload, { maxAttempts: 2 });
		const now = new Date();
		JobDTO.claimNext(now)?.fail(new Error("boom"), now);
		expect(rowOf(queued.id)).toMatchObject({
			status: "pending",
			lastError: "boom",
			attempts: 1,
		});
		expect(rowOf(queued.id)?.runAt.getTime()).toBeGreaterThan(now.getTime());
		const later = new Date(now.getTime() + 60_000);
		JobDTO.claimNext(later)?.fail("again", later);
		expect(rowOf(queued.id)).toMatchObject({
			status: "failed",
			lastError: "again",
			attempts: 2,
		});
	});

	test("requeueStale and pruneFinished", () => {
		JobDTO.enqueue("jobs.prune", payload);
		JobDTO.claimNext();
		expect(JobDTO.requeueStale()).toBe(1);
		JobDTO.claimNext()?.complete();
		expect(JobDTO.pruneFinished(new Date(Date.now() - 60_000))).toBe(0);
		expect(JobDTO.pruneFinished(new Date(Date.now() + 60_000))).toBe(1);
	});
});
