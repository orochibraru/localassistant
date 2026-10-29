import { error } from "@sveltejs/kit";

import { frigate } from "#lib/server/devices/frigate.js";

const resources = new Set(["snapshot.jpg", "clip.mp4", "thumbnail.jpg"]);

export const GET = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, "Sign in again to continue.");
	}
	if (!resources.has(params.resource) || !/^[\w.-]+$/.test(params.eventId)) {
		error(404, "Not found");
	}
	try {
		return await frigate.proxy(
			`/api/events/${params.eventId}/${params.resource}`,
			request,
		);
	} catch (failure) {
		error(
			502,
			failure instanceof Error ? failure.message : "Frigate didn't answer.",
		);
	}
};
