import { NotificationDTO } from "#lib/dto/notification.js";
import { access } from "#lib/server/auth/access.js";

export const POST = () => {
	NotificationDTO.markRead(access.requireUser().id);
	return new Response(null, { status: 204 });
};
