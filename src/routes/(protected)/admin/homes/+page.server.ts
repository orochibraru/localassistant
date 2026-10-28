import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { HomeDTO } from "#lib/dto/home.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";

const homeName = z
	.string()
	.trim()
	.min(1, "Name the home.")
	.max(40, "Keep it under 40 characters.");

const multipleSchema = z.object({
	multipleHomes: z.stringbool().default(false),
});
const newHomeSchema = z.object({ name: homeName });
const renameHomeSchema = z.object({ id: z.string().min(1), name: homeName });

export const load = async ({ parent }) => {
	await parent();
	return {
		allHomes: HomeDTO.all().map((home) => home.toJSON()),
	};
};

export const actions = {
	multiple: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(multipleSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (!parsed.data.multipleHomes && HomeDTO.all().length > 1) {
			return fail(400, {
				error: "Delete the other homes first: only the first one would show.",
			});
		}
		setSetting("multipleHomes", parsed.data.multipleHomes);
		return { saved: true };
	},
	add: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		if (!getSetting("multipleHomes")) {
			return fail(400, { error: "Turn on several homes first." });
		}
		const parsed = parseForm(newHomeSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		return { home: HomeDTO.create(parsed.data.name).toJSON() };
	},
	rename: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(renameHomeSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const home = HomeDTO.find(parsed.data.id);
		if (!home) {
			return fail(404, { error: "That home is gone." });
		}
		home.rename(parsed.data.name);
		return { saved: true };
	},
	remove: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(idSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a home." });
		}
		if (HomeDTO.all().length < 2) {
			return fail(400, { error: "The last home can't be deleted." });
		}
		HomeDTO.find(parsed.data.id)?.delete();
		return { removed: true };
	},
};
