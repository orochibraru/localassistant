import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { access } from "#lib/server/auth/access.js";
import { devices } from "#lib/server/devices/devices.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import { deviceCommandSchema } from "#lib/server/validation/automation.js";

export const POST = async ({ params, request }) => {
	access.requireUser();
	const command = await mobileApi.body(request, deviceCommandSchema);
	const device = DeviceDTO.find(params.deviceId);
	if (!device) {
		error(404, "That device is gone.");
	}
	try {
		await devices.command(device, command);
	} catch (failure) {
		error(502, devices.message(failure));
	}
	return new Response(null, { status: 204 });
};
