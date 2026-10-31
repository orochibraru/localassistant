import { fail } from "@sveltejs/kit";

import { NotificationDTO } from "#lib/dto/notification.js";
import { access } from "#lib/server/auth/access.js";
import { parseForm } from "#lib/server/validation/form.js";
import { notificationIdSchema } from "#lib/server/validation/notification.js";

export const load = async ({ parent, url }) => {
	const { user } = await parent();
	const notifications = NotificationDTO.forUser(user.id).map((entry) => ({
		...entry,
		url: access.safeRedirectTarget(
			new URL(`?redirectTo=${encodeURIComponent(entry.url)}`, url),
		),
	}));
	NotificationDTO.markRead(user.id);
	return { notifications };
};

export const actions = {
	remove: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(notificationIdSchema, await request.formData());
		if (parsed.success) {
			NotificationDTO.remove(locals.user.id, [parsed.data.id]);
		}
		return { removed: true };
	},
	clear: ({ locals }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		return { removed: NotificationDTO.remove(locals.user.id) };
	},
};
