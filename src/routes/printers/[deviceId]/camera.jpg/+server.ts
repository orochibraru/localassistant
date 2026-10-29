import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { bambuCamera } from "#lib/server/devices/bambu-camera.js";
import { devices } from "#lib/server/devices/devices.js";

export const GET = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, "Sign in again to continue.");
	}
	const device = DeviceDTO.find(params.deviceId);
	if (device?.kind !== "bambu-printer") {
		error(404, "Not found");
	}
	try {
		const jpeg = await bambuCamera.snapshot(device);
		return new Response(new Uint8Array(jpeg), {
			headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
		});
	} catch (failure) {
		error(502, devices.message(failure));
	}
};
