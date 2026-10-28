import { resolve } from "$app/paths";
import { redirect } from "@sveltejs/kit";

import { authService } from "#lib/server/auth/auth.js";

export const actions = {
	signOut: async ({ request }) => {
		await authService.get().api.signOut({ headers: request.headers });
		redirect(303, resolve("/auth/sign-in"));
	},
};
