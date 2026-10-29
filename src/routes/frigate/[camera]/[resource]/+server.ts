import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { frigate } from "#lib/server/devices/frigate.js";

const paths: Record<string, (camera: string) => string> = {
	"latest.jpg": (camera) => `/api/${camera}/latest.jpg?h=480`,
	stream: (camera) => `/api/${camera}?fps=5&h=480`,
};

export const GET = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, "Sign in again to continue.");
	}
	const path = paths[params.resource];
	const known = DeviceDTO.all().some(
		(device) =>
			device.kind === "frigate-camera" && device.externalId === params.camera,
	);
	if (!path || !known) {
		error(404, "Not found");
	}
	try {
		return await frigate.proxy(
			path(encodeURIComponent(params.camera)),
			request,
		);
	} catch (failure) {
		error(
			502,
			failure instanceof Error ? failure.message : "Frigate didn't answer.",
		);
	}
};
