import { json } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { access } from "#lib/server/auth/access.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import { mobileDeviceSchema } from "#lib/server/validation/mobile.js";

export const PUT = async ({ request, url }) => {
	const user = access.requireUser();
	const { installationId, name } = await mobileApi.body(
		request,
		mobileDeviceSchema,
	);
	const device = DeviceDTO.upsert({
		kind: "app",
		homeId: mobileApi.home(url).id,
		ownerId: user.id,
		name,
		externalId: `${user.id}:${installationId}`,
	});
	return json({ deviceId: device.id });
};
