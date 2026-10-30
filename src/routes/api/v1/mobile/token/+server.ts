import { error, json } from "@sveltejs/kit";

import { mobileSignIn } from "#lib/server/auth/mobile.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import { mobileTokenSchema } from "#lib/server/validation/mobile.js";

export const POST = async ({ getClientAddress, request }) => {
	const { code, codeVerifier, device } = await mobileApi.body(
		request,
		mobileTokenSchema,
	);
	const session = await mobileSignIn.exchange(
		code,
		codeVerifier,
		device,
		getClientAddress(),
	);
	return json(session);
};

export const DELETE = async ({ locals }) => {
	if (!locals.session) {
		error(401, "Unauthorized");
	}
	await mobileSignIn.signOut(locals.session.token);
	return new Response(null, { status: 204 });
};
