import { resolve } from "$app/paths";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { error, redirect } from "@sveltejs/kit";

import { authService } from "#lib/server/auth/auth.js";

const signatureParams = ["sig", "exp", "ba_iat", "ba_pl", "ba_param"];

export const GET = async ({ locals, url }) => {
	const { secret } = await authService.get().$context;
	if (!(await verifyOAuthQueryParams(url.search.slice(1), secret))) {
		error(400, "This sign-in link expired. Start again from your AI app.");
	}
	const params = new URLSearchParams(url.search);
	for (const name of signatureParams) {
		params.delete(name);
	}
	if (locals.user) {
		params.delete("prompt");
	}
	const authorize = `/api/auth/oauth2/authorize?${params.toString()}`;
	redirect(
		303,
		locals.user
			? authorize
			: `${resolve("/auth/sign-in")}?redirectTo=${encodeURIComponent(authorize)}`,
	);
};
