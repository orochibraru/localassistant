import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { HomeDTO } from "#lib/dto/home.js";
import { JobDTO } from "#lib/dto/job.js";
import { automations } from "#lib/server/automations/automations.js";
import { Logger } from "#lib/server/core/logger.js";
import { broker } from "#lib/server/devices/broker.js";
import { cameras } from "#lib/server/devices/cameras.js";
import { devices } from "#lib/server/devices/devices.js";
import { energy } from "#lib/server/house/energy.js";
import { weatherService } from "#lib/server/house/weather.js";
import type { JobPayloads, JobType } from "#lib/server/jobs/types.js";
import { mailer } from "#lib/server/notifications/mailer.js";
import { pushNotifications } from "#lib/server/notifications/push.js";

const logger = new Logger("Jobs");

const dayMs = 24 * 60 * 60 * 1000;
const refreshIntervalMs = 2 * 60 * 1000;
const weatherIntervalMs = 15 * 60 * 1000;
const energyIntervalMs = 15 * 60 * 1000;
const energyKeptDays = 800;

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
	"weather.refresh": async ({ homeId }) => {
		if (homeId) {
			const home = HomeDTO.find(homeId);
			if (home) {
				await weatherService.refresh(home);
			}
			return;
		}
		JobDTO.enqueue(
			"weather.refresh",
			{},
			{ runAt: new Date(Date.now() + weatherIntervalMs), maxAttempts: 1 },
		);
		for (const home of HomeDTO.all()) {
			await weatherService.refresh(home);
		}
	},
	"automations.tick": async () => {
		const now = new Date();
		JobDTO.enqueue(
			"automations.tick",
			{},
			{
				runAt: new Date(Math.floor(now.getTime() / 60_000) * 60_000 + 61_000),
				maxAttempts: 1,
			},
		);
		const ran = await automations.tick(AutomationDTO.all(), now);
		logger.debug("Checked automations", { ran });
	},
	"automation.run": async ({ automationId }) => {
		const automation = AutomationDTO.find(automationId);
		if (automation) {
			await automations.run(automation);
		}
	},
	"broker.connect": () => {
		broker.restart();
	},
	"cameras.sync": async () => {
		JobDTO.enqueue(
			"cameras.sync",
			{},
			{ runAt: new Date(Date.now() + 30_000), maxAttempts: 1 },
		);
		await cameras.sync();
	},
	"energy.record": () => {
		JobDTO.enqueue(
			"energy.record",
			{},
			{ runAt: new Date(Date.now() + energyIntervalMs), maxAttempts: 1 },
		);
		logger.debug("Recorded energy", { meters: energy.record() });
	},
	"jobs.prune": ({ olderThanDays }) => {
		const removed = JobDTO.pruneFinished(
			new Date(Date.now() - olderThanDays * dayMs),
		);
		const readings = EnergyReadingDTO.pruneBefore(
			new Date(Date.now() - energyKeptDays * dayMs),
		);
		logger.info("Pruned finished jobs", { removed, readings });
		JobDTO.enqueue(
			"jobs.prune",
			{ olderThanDays },
			{ runAt: new Date(Date.now() + dayMs) },
		);
	},
};
