import { error } from "@sveltejs/kit";

import { NotificationDTO } from "#lib/dto/notification.js";
import { access } from "#lib/server/auth/access.js";
import { notificationIdSchema } from "#lib/server/validation/notification.js";

export const DELETE = ({ params }) => {
	const user = access.requireUser();
	const parsed = notificationIdSchema.safeParse({ id: params.notificationId });
	if (
		!parsed.success ||
		NotificationDTO.remove(user.id, [parsed.data.id]) === 0
	) {
		error(404, "That notification is gone.");
	}
	return new Response(null, { status: 204 });
};
