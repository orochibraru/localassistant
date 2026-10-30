import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { access } from "#lib/server/auth/access.js";
import { backups } from "#lib/server/core/backups.js";
import { parseForm } from "#lib/server/validation/form.js";

const backupNameSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const load = async ({ parent }) => {
	await parent();
	return { backups: backups.list() };
};

export const actions = {
	create: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		try {
			return { created: backups.create().name };
		} catch {
			return fail(500, {
				error: "The backup couldn't be written. Is the disk full?",
			});
		}
	},
	remove: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(backupNameSchema, await request.formData());
		if (parsed.success) {
			backups.remove(parsed.data.name);
		}
		return { removed: true };
	},
};
