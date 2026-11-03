import { error, json } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { access } from "#lib/server/auth/access.js";
import { devices } from "#lib/server/devices/devices.js";

export const GET = async ({ params }) => {
	access.requireUser();
	const device = DeviceDTO.find(params.deviceId);
	const state = device?.state;
	if (!device || state?.type !== "camera") {
		error(404, "That camera is gone.");
	}
	return json({
		live: state.live,
		snapshot: state.snapshot,
		...(await devices.clips(device)),
	});
};
