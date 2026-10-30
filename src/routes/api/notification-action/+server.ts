import { error, json } from "@sveltejs/kit";

import { SceneDTO } from "#lib/dto/scene.js";
import { sceneActionPrefix } from "#lib/notifications.js";
import { scenes } from "#lib/server/automations/scenes.js";
import { notificationActionSchema } from "#lib/server/validation/notification.js";

export const POST = async ({ locals, request, url }) => {
	if (!locals.user) {
		error(401, "Sign in again to continue.");
	}
	const origin = request.headers.get("origin");
	if (origin && origin !== url.origin) {
		error(403, "That came from another site.");
	}
	const parsed = notificationActionSchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!parsed.success) {
		error(400, "That button doesn't do anything.");
	}
	const scene = SceneDTO.find(
		parsed.data.action.slice(sceneActionPrefix.length),
	);
	if (!scene) {
		error(404, "That scene is gone.");
	}
	const failures = await scenes.activate(scene);
	if (failures.length > 0) {
		error(502, failures.join(" "));
	}
	return json({ done: true });
};
