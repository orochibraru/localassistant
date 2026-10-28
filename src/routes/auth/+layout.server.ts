import { resolve } from "$app/paths";
import { redirect } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { instanceSetup } from "#lib/server/auth/setup.js";

export const load = ({ locals, route, url }) => {
	if (locals.user) {
		redirect(303, access.safeRedirectTarget(url));
	}
	if (locals.gate) {
		access.redirectToSignIn(new URL(access.safeRedirectTarget(url), url));
	}
	const onSetup = route.id === "/auth/setup";
	if (instanceSetup.needed() && !onSetup) {
		redirect(303, resolve("/auth/setup"));
	}
	if (!instanceSetup.needed() && onSetup) {
		redirect(303, resolve("/auth/sign-in"));
	}
};
