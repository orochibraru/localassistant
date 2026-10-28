import { JobDTO } from "#lib/dto/job.js";
import { configuration } from "#lib/server/core/config.js";
import { Logger } from "#lib/server/core/logger.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";

import { JobRunner } from "./runner.js";
import { isProcessAlive } from "./watchdog.js";

const logger = new Logger("Worker");

const parentPid = process.ppid;
const shutdownDeadlineMs = 30_000;

const requeued = JobDTO.requeueStale();
if (requeued > 0) {
	logger.warn("Requeued jobs left running by a previous worker", { requeued });
}
if (!JobDTO.isQueued("jobs.prune")) {
	JobDTO.enqueue("jobs.prune", { olderThanDays: 1 });
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
