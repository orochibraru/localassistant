import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { getSetting, sessionDayOptions, setSetting } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { authService } from "#lib/server/auth/auth.js";
import { configuration } from "#lib/server/core/config.js";
import { mailer } from "#lib/server/notifications/mailer.js";
import { parseForm } from "#lib/server/validation/form.js";

const accessSchema = z.object({
	requireTwoFactor: z.stringbool().default(false),
	requirePasskey: z.stringbool().default(false),
	sessionDays: z.coerce
		.number()
		.pipe(z.literal(sessionDayOptions, "Pick how long sessions last.")),
	publicOrigin: z
		.url({
			protocol: /^https?$/,
			error: "Enter the address people open, like https://home.example.",
		})
		.transform((value) => new URL(value).origin)
		.optional(),
});

export const load = async ({ parent }) => {
	await parent();
	return {
		requireTwoFactor: getSetting("requireTwoFactor"),
		requirePasskey: getSetting("requirePasskey"),
		sessionDays: getSetting("sessionDays"),
		publicOrigin: authService.publicOrigin() ?? "",
		originPinned: configuration.get().origin !== undefined,
		emailConfigured: mailer.isConfigured(),
	};
};

export const actions = {
	default: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(accessSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		setSetting("requireTwoFactor", parsed.data.requireTwoFactor);
		setSetting("requirePasskey", parsed.data.requirePasskey);
		setSetting("sessionDays", parsed.data.sessionDays);
		if (parsed.data.publicOrigin) {
			setSetting("publicOrigin", parsed.data.publicOrigin);
		}
		return { saved: true };
	},
};
