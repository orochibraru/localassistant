import { error, fail, redirect } from "@sveltejs/kit";

import { mobileSignIn } from "#lib/server/auth/mobile.js";
import { parseForm } from "#lib/server/validation/form.js";
import { mobileAuthorizeSchema } from "#lib/server/validation/mobile.js";

const malformed = "This sign-in link is broken. Start again from the app.";

export const load = async ({ parent, url }) => {
	await parent();
	const parsed = mobileAuthorizeSchema.safeParse(
		Object.fromEntries(url.searchParams),
	);
	if (!parsed.success) {
		error(400, malformed);
	}
	return { request: parsed.data };
};

export const actions = {
	approve: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(mobileAuthorizeSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: malformed });
		}
		redirect(303, mobileSignIn.approve(locals.user.id, parsed.data), {
			external: true,
		});
	},
};
