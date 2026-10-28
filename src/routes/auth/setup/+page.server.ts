import { resolve } from "$app/paths";
import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";

import { UserDTO } from "#lib/dto/user.js";
import { authService } from "#lib/server/auth/auth.js";
import { rateLimits } from "#lib/server/auth/rate-limit.js";
import { instanceSetup, SetupError } from "#lib/server/auth/setup.js";
import { signUpCookies } from "#lib/server/auth/sign-up-cookies.js";
import { signUp } from "#lib/server/auth/sign-up.js";
import {
	codeSchema,
	emailSchema,
	newAccountSchema,
} from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

const alreadySetUp = "This server already has an admin. Sign in instead.";

export const load = ({ cookies }) => ({
	step: signUpCookies.hasSetupTicket(cookies)
		? ("account" as const)
		: ("code" as const),
});

export const actions = {
	newCode: () => {
		if (!instanceSetup.needed()) {
			return fail(400, { error: alreadySetUp });
		}
		try {
			instanceSetup.issueCode();
			return { sent: true };
		} catch (error) {
			if (error instanceof SetupError) {
				return fail(400, { error: error.message });
			}
			throw error;
		}
	},
	verify: async ({ cookies, getClientAddress, request, url }) => {
		if (!instanceSetup.needed()) {
			return fail(400, { error: alreadySetUp });
		}
		const parsed = parseForm(codeSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const client = getClientAddress();
		if (rateLimits.setupCodeAttempts.blocked(client)) {
			return fail(429, { error: "Too many tries. Wait an hour." });
		}
		rateLimits.setupCodeAttempts.hit(client);
		if (!instanceSetup.verifyCode(parsed.data.code)) {
			return fail(400, {
				errors: {
					code: ["That code isn't right, or it expired. Print a new one."],
				},
			});
		}
		signUpCookies.grantSetupTicket(cookies, url);
		return { verified: true };
	},
	create: async ({ cookies, request, url }) => {
		if (!instanceSetup.needed()) {
			return fail(400, { error: alreadySetUp });
		}
		if (!signUpCookies.hasSetupTicket(cookies)) {
			return fail(400, { error: "Enter the setup code first." });
		}
		const formData = await request.formData();
		const email = emailSchema.safeParse(formData.get("email"));
		if (!email.success) {
			return fail(400, { errors: { email: ["Enter a valid email."] } });
		}
		const parsed = parseForm(newAccountSchema(email.data), formData);
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		authService.rememberPublicOrigin(url.origin);
		try {
			const userId = await signUp.createVerifiedAccount({
				email: email.data,
				name: parsed.data.name,
				password: parsed.data.password,
				headers: request.headers,
			});
			UserDTO.setRole(userId, "admin");
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					error: error.body?.message ?? "Could not create the account.",
				});
			}
			throw error;
		}
		signUpCookies.clearSetupTicket(cookies);
		redirect(303, resolve("/(protected)/admin/overview"));
	},
};
