import { access } from "#lib/server/auth/access.js";
import { deviceAdmin } from "#lib/server/devices/device-admin.js";
import { mobileApi } from "#lib/server/mobile/api.js";

export const POST = async ({ params }) => {
	access.requireAdmin();
	return mobileApi.answer(
		await deviceAdmin.discover({ plugin: params.pluginId }),
		(found) => ({ found }),
	);
};
