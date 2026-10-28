import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import { JobDTO } from "#lib/dto/job.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { job } from "#lib/server/db/schema.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";

import { JobRunner } from "../../../src/worker/runner.js";
import { resetDatabase } from "../database.js";

function statuses() {
	return databaseConnection
		.get()
		.select({ type: job.type, status: job.status })
		.from(job)
		.all();
}

describe("JobRunner", () => {
	beforeEach(resetDatabase);

	test("runs due jobs and the prune job reschedules itself", async () => {
		JobDTO.enqueue("jobs.prune", { olderThanDays: 7 });
		const runner = new JobRunner({
			concurrency: 1,
			pollIntervalMs: 5,
			handlers: jobHandlers,
		});
		runner.tick();
		runner.stop();
		await runner.run();
		expect(statuses()).toEqual([
			{ type: "jobs.prune", status: "done" },
			{ type: "jobs.prune", status: "pending" },
		]);
	});

	test("a throwing handler records the failure", async () => {
		const queued = JobDTO.enqueue("jobs.prune", { olderThanDays: 7 });
		const runner = new JobRunner({
			concurrency: 1,
			pollIntervalMs: 5,
			handlers: {
				...jobHandlers,
				"jobs.prune": () => {
					throw new Error("nope");
				},
			},
		});
		const claimed = JobDTO.claimNext();
		expect(claimed?.id).toBe(queued.id);
		if (claimed) {
			await runner.process(claimed);
		}
		expect(databaseConnection.get().select().from(job).get()).toMatchObject({
			status: "pending",
			lastError: "nope",
		});
	});

	test("run stops when the parent is gone", async () => {
		const runner = new JobRunner({
			concurrency: 1,
			pollIntervalMs: 5,
			handlers: jobHandlers,
			isParentAlive: () => false,
		});
		await runner.run();
		expect(statuses()).toEqual([]);
	});

	test("run polls until stopped", async () => {
		const runner = new JobRunner({
			concurrency: 1,
			pollIntervalMs: 5,
			handlers: jobHandlers,
			isParentAlive: () => true,
		});
		const running = runner.run();
		JobDTO.enqueue("jobs.prune", { olderThanDays: 7 });
		await Bun.sleep(30);
		runner.stop();
		await running;
		expect(statuses()[0]).toEqual({ type: "jobs.prune", status: "done" });
	});

	test("an unknown job type fails the job", async () => {
		JobDTO.enqueue("jobs.prune", { olderThanDays: 7 });
		const runner = new JobRunner({
			concurrency: 1,
			pollIntervalMs: 5,
			handlers: {} as typeof jobHandlers,
		});
		const claimed = JobDTO.claimNext();
		if (claimed) {
			await runner.process(claimed);
		}
		expect(databaseConnection.get().select().from(job).get()?.lastError).toBe(
			"No handler for job type jobs.prune",
		);
	});

	test("errors while claiming or recording a failure never escape", async () => {
		const runner = new JobRunner({
			concurrency: 1,
			pollIntervalMs: 5,
			handlers: {} as typeof jobHandlers,
		});
		const claim = spyOn(JobDTO, "claimNext").mockImplementation(() => {
			throw new Error("locked");
		});
		expect(() => runner.tick()).not.toThrow();
		claim.mockRestore();
		const queued = JobDTO.enqueue("jobs.prune", { olderThanDays: 7 });
		spyOn(queued, "fail").mockImplementation(() => {
			throw new Error("disk full");
		});
		await runner.process(queued);
		expect(queued.fail).toHaveBeenCalled();
	});
});
