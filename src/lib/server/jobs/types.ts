import type { EmailMessage } from "#lib/server/notifications/mailer.js";
import type { PushNotification } from "#lib/server/notifications/push.js";

export interface JobPayloads {
	"jobs.prune": { olderThanDays: number };
	"email.send": EmailMessage;
	"push.send": PushNotification & { userIds: string[] };
	"devices.refresh": Record<string, never>;
	"device.refresh": { deviceId: string };
	"weather.refresh": { homeId?: string };
	"automations.tick": Record<string, never>;
	"automation.run": { automationId: string };
	"automation.resume": {
		automationId: string;
		runId: string;
		step: number;
		roomId: string | null;
		by: string | null;
	};
	"broker.connect": Record<string, never>;
	"energy.record": Record<string, never>;
	"plugins.reload": Record<string, never>;
	"plugins.restart": { pluginId: string };
	"plugins.check": Record<string, never>;
}

export type JobType = keyof JobPayloads;
