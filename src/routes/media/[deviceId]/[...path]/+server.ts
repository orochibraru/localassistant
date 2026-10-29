import { error, isHttpError } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { devices } from "#lib/server/devices/devices.js";
import { pluginContexts } from "#lib/server/plugins/context.js";
import { plugins } from "#lib/server/plugins/registry.js";

export const GET = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, "Sign in again to continue.");
	}
	const device = DeviceDTO.find(params.deviceId);
	const hosted = device ? plugins.forKind(device.kind) : undefined;
	if (
		!device ||
		!hosted?.plugin.serve ||
		!plugins.enabled(hosted.manifest.id) ||
		params.path.split("/").includes("..")
	) {
		error(404, "Not found");
	}
	try {
		return await hosted.plugin.serve(
			pluginContexts.device(device),
			params.path,
			request,
			hosted.context,
		);
	} catch (failure) {
		if (isHttpError(failure)) {
			throw failure;
		}
		error(502, devices.message(failure));
	}
};
