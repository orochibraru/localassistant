import { resolve } from "$app/paths";
import { error, fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";

import { InviteDTO } from "#lib/dto/invite.js";
import { UserDTO } from "#lib/dto/user.js";
import { signUp } from "#lib/server/auth/sign-up.js";
import { newAccountSchema } from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

function inviteFor(token: string): InviteDTO {
	const invite = InviteDTO.findByToken(token);
	if (!invite) {
		error(404, "This invite is invalid, used or expired. Ask for a new one.");
	}
	return invite;
}

export const load = ({ params }) => {
	const invite = inviteFor(params.token).toJSON();
	return { email: invite.email, invitedByName: invite.invitedByName };
};

export const actions = {
	default: async ({ params, request }) => {
		const invite = inviteFor(params.token);
		if (UserDTO.emailExists(invite.email)) {
			return fail(400, {
				error: "That email already has an account. Sign in instead.",
			});
		}
		const parsed = parseForm(
			newAccountSchema(invite.email),
			await request.formData(),
		);
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			await signUp.createVerifiedAccount({
				email: invite.email,
				name: parsed.data.name,
				password: parsed.data.password,
				headers: request.headers,
			});
		} catch (caught) {
			if (caught instanceof APIError) {
				return fail(400, {
					error: caught.body?.message ?? "Could not create the account.",
				});
			}
			throw caught;
		}
		invite.accept();
		redirect(303, resolve("/(protected)"));
	},
};
