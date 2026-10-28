import { resolve } from "$app/paths";
import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { InviteDTO } from "#lib/dto/invite.js";
import { UserDTO } from "#lib/dto/user.js";
import { access } from "#lib/server/auth/access.js";
import { authService } from "#lib/server/auth/auth.js";
import { emails } from "#lib/server/notifications/emails.js";
import { mailer } from "#lib/server/notifications/mailer.js";
import { emailSchema } from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

const inviteSchema = z.object({ email: emailSchema });
const inviteIdSchema = z.object({ id: z.string().min(1) });

export const load = async ({ parent }) => {
	await parent();
	return {
		invites: InviteDTO.list().map((invite) => invite.toJSON()),
		emailConfigured: mailer.isConfigured(),
	};
};

export const actions = {
	create: async ({ locals, request, url }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(inviteSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (UserDTO.emailExists(parsed.data.email)) {
			return fail(400, {
				errors: { email: ["That email already has an account."] },
			});
		}
		const { token } = InviteDTO.create(parsed.data.email, admin.id);
		const link = new URL(
			resolve("/auth/invite/[token]", { token }),
			authService.publicOrigin() ?? url.origin,
		).href;
		const emailed = mailer.isConfigured();
		if (emailed) {
			emails.queue(emails.invite(parsed.data.email, link, admin.name));
		}
		return { link, emailed };
	},
	revoke: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(inviteIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick an invite." });
		}
		InviteDTO.revoke(parsed.data.id);
		return { revoked: true };
	},
};
