import { resolve } from "$app/paths";
import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { z } from "zod";

import { getSetting } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { authService } from "#lib/server/auth/auth.js";
import { rateLimits } from "#lib/server/auth/rate-limit.js";
import { signInMethods } from "#lib/server/auth/sign-in-methods.js";
import { mailer } from "#lib/server/notifications/mailer.js";
import {
	emailCodeSignInSchema,
	emailSignInSchema,
	signInSchema,
} from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

const ssoSchema = z.object({ provider: z.string().min(1) });

export const load = ({ url }) => ({
	redirectTo: access.safeRedirectTarget(url),
	signUpsOpen: getSetting("signUpsEnabled"),
	methods: signInMethods.enabled(),
	passwordReset: signInMethods.isOn("passwordSignIn") && mailer.isConfigured(),
});

export const actions = {
	password: async ({ getClientAddress, request, url }) => {
		const parsed = parseForm(signInSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const account = parsed.data.email.toLowerCase();
		const address = getClientAddress();
		if (
			rateLimits.passwordAttempts.blocked(account) ||
			rateLimits.addressAttempts.blocked(address)
		) {
			return fail(429, {
				error: "Too many tries. Wait 15 minutes, or reset your password.",
			});
		}
		let result: Awaited<
			ReturnType<ReturnType<typeof authService.get>["api"]["signInEmail"]>
		>;
		try {
			result = await authService.get().api.signInEmail({
				body: parsed.data,
				headers: request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				rateLimits.passwordAttempts.hit(account);
				rateLimits.addressAttempts.hit(address);
				return fail(400, {
					error:
						error.status === "FORBIDDEN"
							? error.message
							: "Wrong email or password.",
				});
			}
			throw error;
		}
		rateLimits.passwordAttempts.reset(account);
		if ("twoFactorRedirect" in result && result.twoFactorRedirect) {
			redirect(
				303,
				`${resolve("/auth/two-factor")}?redirectTo=${encodeURIComponent(access.safeRedirectTarget(url))}`,
			);
		}
		redirect(303, access.safeRedirectTarget(url));
	},
	emailLink: async ({ getClientAddress, request, url }) => {
		if (!signInMethods.enabled().magicLink) {
			return fail(400, { error: "That sign-in method is turned off." });
		}
		const parsed = parseForm(emailSignInSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (!rateLimits.mayEmail(parsed.data.email, getClientAddress())) {
			return fail(429, {
				error: "Too many emails asked for. Wait a while and try again.",
			});
		}
		try {
			await authService.get().api.signInMagicLink({
				body: {
					email: parsed.data.email,
					callbackURL: access.safeRedirectTarget(url),
					errorCallbackURL: `${resolve("/auth/sign-in")}?link=expired`,
				},
				headers: request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					error:
						error.status === "FORBIDDEN"
							? error.message
							: "The link couldn't be sent. Try again in a minute.",
				});
			}
			throw error;
		}
		return { linkSent: parsed.data.email };
	},
	emailCode: async ({ getClientAddress, request }) => {
		if (!signInMethods.enabled().emailCode) {
			return fail(400, { error: "That sign-in method is turned off." });
		}
		const parsed = parseForm(emailSignInSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (!rateLimits.mayEmail(parsed.data.email, getClientAddress())) {
			return fail(429, {
				error: "Too many emails asked for. Wait a while and try again.",
			});
		}
		try {
			await authService.get().api.sendVerificationOTP({
				body: { email: parsed.data.email, type: "sign-in" },
				headers: request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					error:
						error.status === "FORBIDDEN"
							? error.message
							: "The code couldn't be sent. Try again in a minute.",
				});
			}
			throw error;
		}
		return { codeSent: parsed.data.email };
	},
	verifyCode: async ({ request, url }) => {
		if (!signInMethods.enabled().emailCode) {
			return fail(400, { error: "That sign-in method is turned off." });
		}
		const parsed = parseForm(emailCodeSignInSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		let result: Awaited<
			ReturnType<ReturnType<typeof authService.get>["api"]["signInEmailOTP"]>
		>;
		try {
			result = await authService.get().api.signInEmailOTP({
				body: { email: parsed.data.email, otp: parsed.data.code },
				headers: request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					errors: {
						code: [
							error.status === "FORBIDDEN"
								? error.message
								: "That code isn't right, or it expired.",
						],
					},
				});
			}
			throw error;
		}
		if ("twoFactorRedirect" in result && result.twoFactorRedirect) {
			redirect(
				303,
				`${resolve("/auth/two-factor")}?redirectTo=${encodeURIComponent(access.safeRedirectTarget(url))}`,
			);
		}
		redirect(303, access.safeRedirectTarget(url));
	},
	sso: async ({ request, url }) => {
		const parsed = parseForm(ssoSchema, await request.formData());
		if (
			!parsed.success ||
			!signInMethods
				.enabled()
				.sso.some((provider) => provider.id === parsed.data.provider)
		) {
			return fail(400, { error: "That sign-in method is turned off." });
		}
		let target: string | undefined;
		try {
			const result = await authService.get().api.signInSocial({
				body: {
					provider: parsed.data.provider,
					callbackURL: access.safeRedirectTarget(url),
					errorCallbackURL: resolve("/auth/sign-in"),
				},
				headers: request.headers,
			});
			target = "url" in result ? result.url : undefined;
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					error:
						"The provider couldn't start the sign-in. Try again, or ask an admin to check it.",
				});
			}
			throw error;
		}
		if (!target) {
			return fail(400, { error: "The provider couldn't start the sign-in." });
		}
		redirect(303, target, { external: true });
	},
};
