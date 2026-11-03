import { error } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { deviceAdmin } from "#lib/server/devices/device-admin.js";
import { mobileApi } from "#lib/server/mobile/api.js";

export const PUT = async ({ params, request, url }) => {
	access.requireAdmin();
	const fields = await mobileApi.fields(request);
	return mobileApi.answer(
		await deviceAdmin.edit(mobileApi.home(url).id, {
			...fields,
			id: params.deviceId,
		}),
		(device) => ({ id: device.id }),
	);
};

export const DELETE = ({ params, url }) => {
	access.requireAdmin();
	if (!deviceAdmin.remove(mobileApi.home(url).id, params.deviceId)) {
		error(404, "That device is gone.");
	}
	return new Response(null, { status: 204 });
};
