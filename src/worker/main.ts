import { JobDTO } from "#lib/dto/job.js";
import { automations } from "#lib/server/automations/automations.js";
import { configuration } from "#lib/server/core/config.js";
import { Logger } from "#lib/server/core/logger.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { broker } from "#lib/server/devices/broker.js";
import { deviceEvents } from "#lib/server/devices/device-events.js";
import { history } from "#lib/server/house/history.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";
import { plugins } from "#lib/server/plugins/registry.js";

import { JobRunner } from "./runner.js";
import { isProcessAlive } from "./watchdog.js";

const logger = new Logger("Worker");

const parentPid = process.ppid;
const shutdownDeadlineMs = 30_000;

deviceEvents.onContact((device, next) => automations.onContact(device, next));
deviceEvents.onChange((device, previous, next) =>
	automations.onChange(device, previous, next),
);
deviceEvents.onChange((device, previous, next) =>
	history.record(device, previous, next),
);
deviceEvents.onChange((device, _previous, next) => {
	if (device.ownerId && (next.type === "presence" || next.type === "app")) {
		JobDTO.enqueue(
			"presence.update",
			{ userId: device.ownerId },
			{ maxAttempts: 1 },
		);
	}
});

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
broker.restart();
await plugins.loadInstalled();
await plugins.startAll();
if (!JobDTO.isQueued("plugins.check")) {
	JobDTO.enqueue("plugins.check", {}, { maxAttempts: 1 });
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
		void plugins
			.stopAll()
			.catch((error: unknown) => logger.error("Plugins failed to stop", error));
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
