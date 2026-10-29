import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { cameras } from "#lib/server/devices/cameras.js";
import { devices } from "#lib/server/devices/devices.js";
import { frigate } from "#lib/server/devices/frigate.js";

export const load = async ({ params, parent }) => {
	const { home } = await parent();
	const device = DeviceDTO.find(params.deviceId, home.id);
	if (device?.kind !== "camera" && device?.kind !== "frigate-camera") {
		error(404, "That camera doesn't exist.");
	}
	const { state: _state, ...camera } = device.toJSON();
	if (device.kind === "camera") {
		return {
			camera,
			recordings: await cameras.recordings(device.id),
			events: [],
			eventsError: null,
		};
	}
	try {
		return {
			camera,
			recordings: [],
			events: await frigate.events(device.externalId),
			eventsError: null,
		};
	} catch (failure) {
		return {
			camera,
			recordings: [],
			events: [],
			eventsError: devices.message(failure),
		};
	}
};
