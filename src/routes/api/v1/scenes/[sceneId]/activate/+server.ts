import { error } from "@sveltejs/kit";

import { SceneDTO } from "#lib/dto/scene.js";
import { access } from "#lib/server/auth/access.js";
import { scenes } from "#lib/server/automations/scenes.js";

export const POST = async ({ params }) => {
	access.requireUser();
	const scene = SceneDTO.find(params.sceneId);
	if (!scene) {
		error(404, "That scene is gone.");
	}
	const failures = await scenes.activate(scene);
	if (failures.length > 0) {
		error(502, failures.join(" "));
	}
	return new Response(null, { status: 204 });
};
