import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";

import { access } from "#lib/server/auth/access.js";
import { authService } from "#lib/server/auth/auth.js";
import { rateLimits } from "#lib/server/auth/rate-limit.js";
import { signInMethods } from "#lib/server/auth/sign-in-methods.js";
import { backupCodeSchema, totpSchema } from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

const tooManyCodes = "Too many tries. Wait 15 minutes and sign in again.";

export const load = ({ url }) => ({
	passkey: signInMethods.enabled().passkey,
	redirectTo: access.safeRedirectTarget(url),
});

export const actions = {
	totp: async ({ getClientAddress, request, url }) => {
		const parsed = parseForm(totpSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const client = getClientAddress();
		if (rateLimits.secondFactorAttempts.blocked(client)) {
			return fail(429, { error: tooManyCodes });
		}
		rateLimits.secondFactorAttempts.hit(client);
		try {
			await authService.get().api.verifyTOTP({
				body: {
					code: parsed.data.code,
					trustDevice: parsed.data.trustDevice ?? false,
				},
				headers: request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					error: "That code didn't match. Try the newest one.",
				});
			}
			throw error;
		}
		redirect(303, access.safeRedirectTarget(url));
	},
	backup: async ({ getClientAddress, request, url }) => {
		const parsed = parseForm(backupCodeSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const client = getClientAddress();
		if (rateLimits.secondFactorAttempts.blocked(client)) {
			return fail(429, { error: tooManyCodes });
		}
		rateLimits.secondFactorAttempts.hit(client);
		try {
			await authService.get().api.verifyBackupCode({
				body: {
					code: parsed.data.code,
					trustDevice: parsed.data.trustDevice ?? false,
				},
				headers: request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { error: "That backup code isn't valid." });
			}
			throw error;
		}
		redirect(303, access.safeRedirectTarget(url));
	},
};
