import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { UserDTO } from "#lib/dto/user.js";
import { access } from "#lib/server/auth/access.js";
import { emailSchema } from "#lib/server/validation/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

const userIdSchema = z.object({ id: z.string().min(1) });
const changeEmailSchema = z.object({
	id: z.string().min(1),
	email: emailSchema,
});

export const load = async ({ parent }) => {
	await parent();
	return {
		users: UserDTO.list().map((entry) => entry.toJSON()),
	};
};

export const actions = {
	promote: async ({ locals, request }) => {
		const admin = access.recentAdminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(userIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a user." });
		}
		UserDTO.setRole(parsed.data.id, "admin");
		return { promoted: true };
	},
	demote: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(userIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a user." });
		}
		if (parsed.data.id === admin.id) {
			return fail(400, {
				error: "Ask another admin to remove your admin role.",
			});
		}
		UserDTO.setRole(parsed.data.id, "member");
		return { demoted: true };
	},
	revokeSessions: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(userIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a user." });
		}
		UserDTO.revokeSessions(parsed.data.id);
		return { revoked: true };
	},
	changeEmail: async ({ locals, request }) => {
		const admin = access.recentAdminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(changeEmailSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const owner = UserDTO.idForEmail(parsed.data.email);
		if (owner && owner !== parsed.data.id) {
			return fail(400, {
				errors: { email: ["Another account already uses that email."] },
			});
		}
		UserDTO.changeEmail(parsed.data.id, parsed.data.email);
		return { emailChanged: true };
	},
	resetFactors: async ({ locals, request }) => {
		const admin = access.recentAdminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(userIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a user." });
		}
		if (parsed.data.id === admin.id) {
			return fail(400, {
				error: "Manage your own factors from your account's security page.",
			});
		}
		UserDTO.resetFactors(parsed.data.id);
		return { factorsReset: true };
	},
	delete: async ({ locals, request }) => {
		const admin = access.recentAdminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(userIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a user." });
		}
		if (parsed.data.id === admin.id) {
			return fail(400, {
				error: "You can't delete your own account from here.",
			});
		}
		UserDTO.delete(parsed.data.id);
		return { deleted: true };
	},
};
