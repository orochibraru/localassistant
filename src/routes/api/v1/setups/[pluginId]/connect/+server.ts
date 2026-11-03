import { access } from "#lib/server/auth/access.js";
import { deviceAdmin } from "#lib/server/devices/device-admin.js";
import { mobileApi } from "#lib/server/mobile/api.js";

export const POST = async ({ params, request, url }) => {
	access.requireAdmin();
	const fields = await mobileApi.fields(request);
	return mobileApi.answer(
		await deviceAdmin.connect(mobileApi.home(url).id, {
			...fields,
			plugin: params.pluginId,
		}),
		(found) => ({ found }),
	);
};
