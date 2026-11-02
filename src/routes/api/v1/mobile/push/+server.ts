import { json } from "@sveltejs/kit";

import { PushSubscriptionDTO } from "#lib/dto/push-subscription.js";
import { access } from "#lib/server/auth/access.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import { pushNotifications } from "#lib/server/notifications/push.js";
import {
	mobilePushEndpointSchema,
	mobilePushSchema,
} from "#lib/server/validation/mobile.js";

export const GET = () => {
	access.requireUser();
	return json({ vapidPublicKey: pushNotifications.vapidPublicKey() });
};

export const PUT = async ({ request }) => {
	const user = access.requireUser();
	const subscription = await mobileApi.body(request, mobilePushSchema);
	PushSubscriptionDTO.save(user.id, subscription);
	return new Response(null, { status: 204 });
};

export const DELETE = async ({ request }) => {
	const user = access.requireUser();
	const { endpoint } = await mobileApi.body(request, mobilePushEndpointSchema);
	PushSubscriptionDTO.removeFor(user.id, endpoint);
	return new Response(null, { status: 204 });
};
