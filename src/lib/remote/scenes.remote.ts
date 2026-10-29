import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

import { SceneDTO } from "#lib/dto/scene.js";
import { access } from "#lib/server/auth/access.js";
import { scenes } from "#lib/server/automations/scenes.js";
import { homes } from "#lib/server/house/homes.js";
import { sceneIdSchema } from "#lib/server/validation/scene.js";

export const activateScene = command(sceneIdSchema, async ({ sceneId }) => {
	access.requireUser();
	const scene = SceneDTO.find(
		sceneId,
		homes.current(getRequestEvent().cookies).id,
	);
	if (!scene) {
		error(404, "That scene is gone.");
	}
	const failures = await scenes.activate(scene);
	if (failures.length > 0) {
		error(502, failures.join(" "));
	}
});
