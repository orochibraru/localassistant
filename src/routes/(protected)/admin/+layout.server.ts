import { error } from "@sveltejs/kit";

import { authService } from "#lib/server/auth/auth.js";

export const load = async ({ parent, url }) => {
	const { isAdmin } = await parent();
	if (!isAdmin) {
		error(404, "Not found");
	}
	authService.rememberPublicOrigin(url.origin);
};
