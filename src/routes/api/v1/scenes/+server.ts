import { error, json } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { library } from "#lib/server/automations/library.js";
import { devices } from "#lib/server/devices/devices.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import { sceneSchema } from "#lib/server/validation/scene.js";

export const POST = async ({ request, url }) => {
	access.requireUser();
	const definition = await mobileApi.body(request, sceneSchema);
	try {
		const scene = library.saveScene(
			mobileApi.home(url).id,
			undefined,
			definition,
		);
		return json(mobileApi.scene(scene), { status: 201 });
	} catch (failure) {
		error(400, devices.message(failure));
	}
};
