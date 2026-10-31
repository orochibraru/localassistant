import { json } from "@sveltejs/kit";

import { NotificationDTO } from "#lib/dto/notification.js";
import { access } from "#lib/server/auth/access.js";

export const GET = () => {
	const user = access.requireUser();
	return json({
		notifications: NotificationDTO.forUser(user.id),
		unread: NotificationDTO.unreadCount(user.id),
	});
};

export const DELETE = () => {
	const user = access.requireUser();
	return json({ removed: NotificationDTO.remove(user.id) });
};
