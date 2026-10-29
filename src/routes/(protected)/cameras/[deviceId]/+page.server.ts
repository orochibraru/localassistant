import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import type { CameraClips } from "#lib/plugin-sdk.js";
import { devices } from "#lib/server/devices/devices.js";
import { pluginContexts } from "#lib/server/plugins/context.js";
import { plugins } from "#lib/server/plugins/registry.js";

export const load = async ({ params, parent }) => {
	const { home } = await parent();
	const device = DeviceDTO.find(params.deviceId, home.id);
	const state = device?.state;
	if (!device || state?.type !== "camera") {
		error(404, "That camera doesn't exist.");
	}
	const { state: _state, ...camera } = device.toJSON();
	const hosted = plugins.forKind(device.kind);
	const empty: CameraClips = {
		title: "Recordings",
		empty: "Nothing yet.",
		clips: [],
	};
	try {
		return {
			camera,
			live: state.live,
			clips: hosted?.plugin.clips
				? await hosted.plugin.clips(
						pluginContexts.device(device),
						hosted.context,
					)
				: empty,
			clipsError: null,
		};
	} catch (failure) {
		return {
			camera,
			live: state.live,
			clips: empty,
			clipsError: devices.message(failure),
		};
	}
};
