import type { EmailMessage } from "#lib/server/notifications/mailer.js";
import type { PushNotification } from "#lib/server/notifications/push.js";

export interface JobPayloads {
	"jobs.prune": { olderThanDays: number };
	"email.send": EmailMessage;
	"push.send": PushNotification & { userIds: string[] };
	"devices.refresh": Record<string, never>;
	"device.refresh": { deviceId: string };
}

export type JobType = keyof JobPayloads;
