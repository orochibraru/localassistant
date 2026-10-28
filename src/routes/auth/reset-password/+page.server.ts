import { resolve } from "$app/paths";
import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";

import { UserDTO } from "#lib/dto/user.js";
import { authService } from "#lib/server/auth/auth.js";
import { newPasswordSchema } from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

export const load = ({ url }) => {
	const token = url.searchParams.get("token") ?? "";
	const email = token ? UserDTO.emailForPasswordReset(token) : undefined;
	return { email: email ?? null };
};

export const actions = {
	default: async ({ request, url }) => {
		const token = url.searchParams.get("token") ?? "";
		const email = token ? UserDTO.emailForPasswordReset(token) : undefined;
		if (!email) {
			return fail(400, {
				error: "This link expired or was already used. Ask for a new one.",
			});
		}
		const parsed = parseForm(
			newPasswordSchema(email),
			await request.formData(),
		);
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			await authService.get().api.resetPassword({
				body: { newPassword: parsed.data.password, token },
				headers: request.headers,
			});
		} catch (caught) {
			if (caught instanceof APIError) {
				return fail(400, {
					error: caught.body?.message ?? "The password couldn't be changed.",
				});
			}
			throw caught;
		}
		redirect(303, `${resolve("/auth/sign-in")}?reset=done`);
	},
};
