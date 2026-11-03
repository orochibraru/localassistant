import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { devices } from "#lib/server/devices/devices.js";

export const load = async ({ params, parent }) => {
	const { home } = await parent();
	const device = DeviceDTO.find(params.deviceId, home.id);
	const state = device?.state;
	if (!device || state?.type !== "camera") {
		error(404, "That camera doesn't exist.");
	}
	const { state: _state, ...camera } = device.toJSON();
	return { camera, live: state.live, ...(await devices.clips(device)) };
};
