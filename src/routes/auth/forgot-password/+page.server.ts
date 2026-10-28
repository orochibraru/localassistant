import { resolve } from "$app/paths";
import { error, fail } from "@sveltejs/kit";
import { APIError } from "better-auth/api";

import { authService } from "#lib/server/auth/auth.js";
import { rateLimits } from "#lib/server/auth/rate-limit.js";
import { signInMethods } from "#lib/server/auth/sign-in-methods.js";
import { mailer } from "#lib/server/notifications/mailer.js";
import { passwordResetRequestSchema } from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

function assertResetsOpen(): void {
	if (!signInMethods.isOn("passwordSignIn") || !mailer.isConfigured()) {
		error(404, "Password resets are turned off on this server. Ask an admin.");
	}
}

export const load = () => {
	assertResetsOpen();
};

export const actions = {
	default: async ({ request }) => {
		assertResetsOpen();
		const parsed = parseForm(
			passwordResetRequestSchema,
			await request.formData(),
		);
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const account = parsed.data.email.toLowerCase();
		if (rateLimits.resetRequests.blocked(account)) {
			return { sentTo: parsed.data.email };
		}
		rateLimits.resetRequests.hit(account);
		try {
			await authService.get().api.requestPasswordReset({
				body: {
					email: parsed.data.email,
					redirectTo: resolve("/auth/reset-password"),
				},
				headers: request.headers,
			});
		} catch (caught) {
			if (caught instanceof APIError) {
				return fail(400, {
					error: "The link couldn't be sent. Try again in a minute.",
				});
			}
			throw caught;
		}
		return { sentTo: parsed.data.email };
	},
};
