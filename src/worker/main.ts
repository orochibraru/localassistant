import { JobDTO } from "#lib/dto/job.js";
import { presets } from "#lib/server/automations/presets.js";
import { configuration } from "#lib/server/core/config.js";
import { Logger } from "#lib/server/core/logger.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { broker } from "#lib/server/devices/broker.js";
import { cameras } from "#lib/server/devices/cameras.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";

import { JobRunner } from "./runner.js";
import { isProcessAlive } from "./watchdog.js";

const logger = new Logger("Worker");

const parentPid = process.ppid;
const shutdownDeadlineMs = 30_000;

broker.onContact((device, _previous, next) => presets.onContact(device, next));

const requeued = JobDTO.requeueStale();
if (requeued > 0) {
	logger.warn("Requeued jobs left running by a previous worker", { requeued });
}
if (!JobDTO.isQueued("jobs.prune")) {
	JobDTO.enqueue("jobs.prune", { olderThanDays: 1 });
}
if (!JobDTO.isQueued("weather.refresh")) {
	JobDTO.enqueue("weather.refresh", {}, { maxAttempts: 1 });
}
if (!JobDTO.isQueued("automations.tick")) {
	JobDTO.enqueue("automations.tick", {}, { maxAttempts: 1 });
}
JobDTO.enqueue("broker.connect", {}, { maxAttempts: 1 });
if (!JobDTO.isQueued("cameras.sync")) {
	JobDTO.enqueue("cameras.sync", {}, { maxAttempts: 1 });
}
if (!JobDTO.isQueued("energy.record")) {
	JobDTO.enqueue("energy.record", {}, { maxAttempts: 1 });
}
if (!JobDTO.isQueued("devices.refresh")) {
	JobDTO.enqueue("devices.refresh", {}, { maxAttempts: 1 });
}

const runner = new JobRunner({
	concurrency: configuration.get().worker.concurrency,
	pollIntervalMs: configuration.get().worker.pollIntervalMs,
	handlers: jobHandlers,
	isParentAlive: () => isProcessAlive(parentPid),
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.once(signal, () => {
		logger.info("Stopping after in-flight jobs", { signal });
		runner.stop();
		cameras.stopAll();
		setTimeout(() => {
			logger.error("Jobs still running after the shutdown deadline, exiting");
			process.exit(1);
		}, shutdownDeadlineMs).unref();
	});
}

logger.info("Worker ready", {
	concurrency: configuration.get().worker.concurrency,
});
try {
	await runner.run();
} catch (error) {
	logger.error("Worker loop crashed", error);
	process.exitCode = 1;
} finally {
	databaseConnection.close();
}
