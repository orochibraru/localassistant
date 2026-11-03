import { error, json } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { library } from "#lib/server/automations/library.js";
import { devices } from "#lib/server/devices/devices.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import { sceneSchema } from "#lib/server/validation/scene.js";

export const PUT = async ({ params, request, url }) => {
	access.requireUser();
	const definition = await mobileApi.body(request, sceneSchema);
	try {
		const scene = library.saveScene(
			mobileApi.home(url).id,
			params.sceneId,
			definition,
		);
		return json(mobileApi.scene(scene));
	} catch (failure) {
		error(400, devices.message(failure));
	}
};

export const DELETE = ({ params, url }) => {
	access.requireUser();
	if (!library.removeScene(mobileApi.home(url).id, params.sceneId)) {
		error(404, "That scene is gone.");
	}
	return new Response(null, { status: 204 });
};
