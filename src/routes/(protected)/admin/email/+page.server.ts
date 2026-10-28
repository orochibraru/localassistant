import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { getSetting, setSetting, smtpSecurityModes } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { secrets } from "#lib/server/core/secrets.js";
import { emails } from "#lib/server/notifications/emails.js";
import { emailSchema } from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

const smtpSchema = z.object({
	host: z
		.string()
		.trim()
		.min(1, "Enter the SMTP host.")
		.regex(/^[a-zA-Z0-9.-]+$/, "Enter a host name, like smtp.example.com."),
	port: z.coerce.number().int().min(1).max(65_535),
	security: z.enum(smtpSecurityModes),
	username: z.string().trim().max(200),
	password: z.string().max(500),
	fromAddress: emailSchema,
	fromName: z.string().trim().min(1, "Enter a sender name.").max(80),
});

export const load = async ({ parent }) => {
	await parent();
	const smtp = getSetting("smtp");
	return {
		smtp: smtp && {
			host: smtp.host,
			port: smtp.port,
			security: smtp.security,
			username: smtp.username,
			hasPassword: smtp.encryptedPassword !== "",
			fromAddress: smtp.fromAddress,
			fromName: smtp.fromName,
		},
	};
};

export const actions = {
	save: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(smtpSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { password, ...rest } = parsed.data;
		const current = getSetting("smtp");
		const encryptedPassword = password
			? secrets.encrypt(password)
			: (current?.encryptedPassword ?? "");
		setSetting("smtp", { ...rest, encryptedPassword });
		return { saved: true };
	},
	test: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		if (!getSetting("smtp")) {
			return fail(400, { error: "Save the SMTP settings first." });
		}
		emails.queue(emails.test(admin.email));
		return { queued: true };
	},
	remove: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		setSetting("smtp", null);
		setSetting("signUpsEnabled", false);
		return { removed: true };
	},
};
