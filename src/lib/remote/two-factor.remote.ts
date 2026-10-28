import { command, getRequestEvent } from "$app/server";

import { access } from "#lib/server/auth/access.js";
import { authService } from "#lib/server/auth/auth.js";

export const trustThisDevice = command(async () => {
	access.requireUser();
	await authService
		.get()
		.api.trustDevice({ headers: getRequestEvent().request.headers });
});
