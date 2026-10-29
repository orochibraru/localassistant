import { AutomationRunDTO } from "#lib/dto/automation-run.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { HomeDTO } from "#lib/dto/home.js";
import { JobDTO } from "#lib/dto/job.js";
import { automations } from "#lib/server/automations/automations.js";
import { Logger } from "#lib/server/core/logger.js";
import { broker } from "#lib/server/devices/broker.js";
import { devices } from "#lib/server/devices/devices.js";
import { energy } from "#lib/server/house/energy.js";
import { weatherService } from "#lib/server/house/weather.js";
import type { JobPayloads, JobType } from "#lib/server/jobs/types.js";
import { mailer } from "#lib/server/notifications/mailer.js";
import { pushNotifications } from "#lib/server/notifications/push.js";
import { pluginManager } from "#lib/server/plugins/manager.js";
import { plugins } from "#lib/server/plugins/registry.js";

const logger = new Logger("Jobs");

const dayMs = 24 * 60 * 60 * 1000;
const refreshIntervalMs = 2 * 60 * 1000;
const weatherIntervalMs = 15 * 60 * 1000;
const energyIntervalMs = 15 * 60 * 1000;
const energyKeptDays = 800;
const runsKeptDays = 30;

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
			await automations.run(automation, "Run by hand");
		}
	},
	"automation.resume": async (payload) => {
		await automations.resume(payload);
	},
	"broker.connect": () => {
		broker.restart();
	},
	"plugins.reload": async () => {
		await plugins.loadInstalled();
		await plugins.startAll();
	},
	"plugins.restart": async ({ pluginId }) => {
		await plugins.restart(pluginId);
	},
	"plugins.check": async () => {
		JobDTO.enqueue(
			"plugins.check",
			{},
			{ runAt: new Date(Date.now() + dayMs), maxAttempts: 1 },
		);
		logger.info("Checked plugins on GitHub", {
			checked: await pluginManager.check(),
		});
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
		const runs = AutomationRunDTO.prune(
			new Date(Date.now() - runsKeptDays * dayMs),
		);
		logger.info("Pruned finished jobs", { removed, readings, runs });
		JobDTO.enqueue(
			"jobs.prune",
			{ olderThanDays },
			{ runAt: new Date(Date.now() + dayMs) },
		);
	},
};
