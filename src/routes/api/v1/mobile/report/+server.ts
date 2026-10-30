import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { access } from "#lib/server/auth/access.js";
import { devices } from "#lib/server/devices/devices.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import { appReportSchema } from "#lib/server/validation/device.js";

export const POST = async ({ request }) => {
	const user = access.requireUser();
	const { deviceId, ...report } = await mobileApi.body(
		request,
		appReportSchema,
	);
	const device = DeviceDTO.find(deviceId);
	if (device?.kind !== "app" || device.ownerId !== user.id) {
		error(404, "That phone isn't in the house anymore.");
	}
	devices.reportApp(device, report);
	return new Response(null, { status: 204 });
};
