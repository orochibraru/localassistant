import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { JobDTO } from "#lib/dto/job.js";
import { PushSubscriptionDTO } from "#lib/dto/push-subscription.js";
import { pushNotifications } from "#lib/server/notifications/push.js";
import { parseForm } from "#lib/server/validation/form.js";

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
