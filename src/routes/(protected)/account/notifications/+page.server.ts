import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { checksFor } from "#lib/automations.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { NotificationRuleDTO } from "#lib/dto/notification-rule.js";
import { PushSubscriptionDTO } from "#lib/dto/push-subscription.js";
import { kindInfo } from "#lib/plugins.js";
import { pushNotifications } from "#lib/server/notifications/push.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";
import { notificationRuleSchema } from "#lib/server/validation/notification.js";

const pushServices = [
	"fcm.googleapis.com",
	"android.googleapis.com",
	"push.services.mozilla.com",
	"push.apple.com",
	"notify.windows.com",
];

const subscriptionSchema = z.object({
	endpoint: z.url({ protocol: /^https$/ }).refine((endpoint) => {
		const host = new URL(endpoint).hostname;
		return pushServices.some(
			(service) => host === service || host.endsWith(`.${service}`),
		);
	}),
	p256dh: z.string().min(1).max(200),
	auth: z.string().min(1).max(100),
	device: z.string().trim().min(1).max(80),
});

const endpointSchema = z.object({ endpoint: z.string().min(1) });

export const load = async ({ parent }) => {
	const { user } = await parent();
	return {
		rules: NotificationRuleDTO.forUser(user.id).map((rule) => rule.toJSON()),
		publicKey: pushNotifications.vapidPublicKey(),
		devices: PushSubscriptionDTO.forUser(user.id).map((device) => {
			const { endpoint, device: name, createdAt } = device.toJSON();
			return { endpoint, name, createdAt };
		}),
	};
};

export const actions = {
	subscribe: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(subscriptionSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, {
				error: "This browser sent a subscription LocalAssistant can't use.",
			});
		}
		PushSubscriptionDTO.save(locals.user.id, parsed.data);
		return { subscribed: true };
	},
	unsubscribe: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(endpointSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "That device is already off." });
		}
		PushSubscriptionDTO.removeFor(locals.user.id, parsed.data.endpoint);
		return { unsubscribed: true };
	},
	addRule: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(notificationRuleSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: Object.values(parsed.errors).flat()[0] });
		}
		const device = DeviceDTO.find(parsed.data.test.deviceId);
		const card = device ? kindInfo(plugins.catalog(), device.kind).card : null;
		if (!card || !checksFor(card).includes(parsed.data.test.check)) {
			return fail(400, {
				error: "That device is gone, or can't be watched for that.",
			});
		}
		NotificationRuleDTO.create(locals.user.id, parsed.data.test);
		return { added: true };
	},
	removeRule: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(idSchema, await request.formData());
		if (parsed.success) {
			NotificationRuleDTO.remove(parsed.data.id, locals.user.id);
		}
		return { removed: true };
	},
	test: ({ locals }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		JobDTO.enqueue("push.send", {
			userIds: [locals.user.id],
			title: "LocalAssistant",
			body: "Notifications work on this device.",
			url: "/account/notifications",
		});
		return { sent: true };
	},
};
