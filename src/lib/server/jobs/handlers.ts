import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { Logger } from "#lib/server/core/logger.js";
import { devices } from "#lib/server/devices/devices.js";
import type { JobPayloads, JobType } from "#lib/server/jobs/types.js";
import { mailer } from "#lib/server/notifications/mailer.js";
import { pushNotifications } from "#lib/server/notifications/push.js";

const logger = new Logger("Jobs");

const dayMs = 24 * 60 * 60 * 1000;
const refreshIntervalMs = 2 * 60 * 1000;

export type JobHandlers = {
	[Type in JobType]: (payload: JobPayloads[Type]) => void | Promise<void>;
};

export const jobHandlers: JobHandlers = {
	"push.send": async ({ userIds, ...notification }) => {
		const delivered = await pushNotifications.deliver(userIds, notification);
		logger.debug("Push sent", { delivered });
	},
	"email.send": async (message) => {
		await mailer.deliver(message);
		logger.info("Email sent", { subject: message.subject });
	},
	"devices.refresh": async () => {
		JobDTO.enqueue(
			"devices.refresh",
			{},
			{ runAt: new Date(Date.now() + refreshIntervalMs), maxAttempts: 1 },
		);
		const refreshed = await devices.refreshAll();
		logger.debug("Refreshed devices", { refreshed });
	},
	"device.refresh": async ({ deviceId }) => {
		const device = DeviceDTO.find(deviceId);
		if (device) {
			await devices.refresh(device);
		}
	},
	"jobs.prune": ({ olderThanDays }) => {
		const removed = JobDTO.pruneFinished(
			new Date(Date.now() - olderThanDays * dayMs),
		);
		logger.info("Pruned finished jobs", { removed });
		JobDTO.enqueue(
			"jobs.prune",
			{ olderThanDays },
			{ runAt: new Date(Date.now() + dayMs) },
		);
	},
};
