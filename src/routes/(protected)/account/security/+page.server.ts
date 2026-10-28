import { fail } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { renderSVG } from "uqr";
import { z } from "zod";

import { hasPassword } from "#lib/dto/account.js";
import { PasskeyDTO } from "#lib/dto/passkey.js";
import { SessionDTO } from "#lib/dto/session.js";
import { authService } from "#lib/server/auth/auth.js";
import { securityPolicy } from "#lib/server/auth/security-policy.js";
import {
	changePasswordSchema,
	passwordConfirmSchema,
	totpSchema,
} from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

const passkeyIdSchema = z.object({ id: z.string().min(1) });
const sessionIdSchema = z.object({ id: z.string().min(1) });

function apiFailure(error: unknown, fallback: string) {
	if (error instanceof APIError) {
		return fail(400, { error: error.body?.message ?? fallback });
	}
	throw error;
}

export const load = async ({ locals, parent }) => {
	const { user } = await parent();
	return {
		twoFactorEnabled: locals.user?.twoFactorEnabled ?? false,
		passkeys: PasskeyDTO.forUser(user.id).map((entry) => entry.toJSON()),
		missing: locals.user ? securityPolicy.missingFactors(locals.user) : [],
		hasPassword: hasPassword(user.id),
		currentSessionId: locals.session?.id ?? "",
		sessions: SessionDTO.forUser(user.id).map((entry) => entry.toJSON()),
	};
};

export const actions = {
	changePassword: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(
			changePasswordSchema(locals.user.email),
			await request.formData(),
		);
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { currentPassword, password } = parsed.data;
		const existing = hasPassword(locals.user.id);
		if (existing && !currentPassword) {
			return fail(400, {
				errors: { currentPassword: ["Enter your current password."] },
			});
		}
		try {
			if (existing) {
				await authService.get().api.changePassword({
					body: {
						currentPassword,
						newPassword: password,
						revokeOtherSessions: true,
					},
					headers: request.headers,
				});
			} else {
				if (
					!locals.session ||
					!securityPolicy.signedInRecently(locals.session)
				) {
					return fail(403, { error: securityPolicy.recentSignInMessage });
				}
				await authService.get().api.setPassword({
					body: { newPassword: password },
					headers: request.headers,
				});
				SessionDTO.revokeOthers(locals.user.id, locals.session.id);
			}
			return { passwordChanged: true };
		} catch (error) {
			return apiFailure(error, "That password isn't right.");
		}
	},
	enableTwoFactor: async ({ request }) => {
		const parsed = parseForm(passwordConfirmSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			const result = await authService.get().api.enableTwoFactor({
				body: { password: parsed.data.password },
				headers: request.headers,
			});
			if (result.method !== "totp") {
				return fail(400, { error: "Authenticator apps aren't available." });
			}
			const { totpURI, backupCodes } = result;
			const secret = new URL(totpURI).searchParams.get("secret") ?? "";
			return {
				setup: {
					qrCode: renderSVG(totpURI, { border: 1 }),
					secret,
					backupCodes,
				},
			};
		} catch (error) {
			return apiFailure(error, "That password isn't right.");
		}
	},
	verifyTwoFactor: async ({ request }) => {
		const parsed = parseForm(totpSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			await authService.get().api.verifyTOTP({
				body: { code: parsed.data.code },
				headers: request.headers,
			});
			return { enabled: true };
		} catch (error) {
			return apiFailure(
				error,
				"That code didn't match. Check your device's clock and try again.",
			);
		}
	},
	disableTwoFactor: async ({ request }) => {
		const parsed = parseForm(passwordConfirmSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			await authService.get().api.disableTwoFactor({
				body: { password: parsed.data.password },
				headers: request.headers,
			});
			return { disabled: true };
		} catch (error) {
			return apiFailure(error, "That password isn't right.");
		}
	},
	deletePasskey: async ({ locals, request }) => {
		if (!locals.session || !securityPolicy.signedInRecently(locals.session)) {
			return fail(403, { error: securityPolicy.recentSignInMessage });
		}
		const parsed = parseForm(passkeyIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a passkey to remove." });
		}
		try {
			await authService.get().api.deletePasskey({
				body: { id: parsed.data.id },
				headers: request.headers,
			});
			return { deleted: true };
		} catch (error) {
			return apiFailure(error, "Could not remove that passkey.");
		}
	},
	revokeSession: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(sessionIdSchema, await request.formData());
		if (
			!parsed.success ||
			parsed.data.id === locals.session?.id ||
			!SessionDTO.revokeForUser(parsed.data.id, locals.user.id)
		) {
			return fail(400, { error: "That session is already signed out." });
		}
		return { revoked: true };
	},
	revokeOtherSessions: ({ locals }) => {
		if (!locals.user || !locals.session) {
			return fail(401, { error: "Sign in again to continue." });
		}
		SessionDTO.revokeOthers(locals.user.id, locals.session.id);
		return { revoked: true };
	},
};
