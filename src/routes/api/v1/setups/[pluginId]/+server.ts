import { access } from "#lib/server/auth/access.js";
import { deviceAdmin } from "#lib/server/devices/device-admin.js";
import { mobileApi } from "#lib/server/mobile/api.js";

export const DELETE = ({ params }) => {
	access.requireAdmin();
	return mobileApi.answer(
		deviceAdmin.disconnect({ plugin: params.pluginId }),
		(removed) => ({ removed }),
	);
};
