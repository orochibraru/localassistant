import { fail } from "@sveltejs/kit";

import { DashboardDTO } from "#lib/dto/dashboard.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { dashboardFormSchema } from "#lib/server/validation/dashboard.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";

export const load = async ({ parent }) => {
	const { home } = await parent();
	return {
		scenes: SceneDTO.inHome(home.id).map((scene) => ({
			id: scene.id,
			name: scene.name,
		})),
	};
};

export const actions = {
	save: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(dashboardFormSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, {
				errors: parsed.errors,
				error: Object.values(parsed.errors).flat()[0],
			});
		}
		const { id, definition } = parsed.data;
		if (id) {
			const existing = DashboardDTO.find(id, locals.user.id);
			if (!existing) {
				return fail(404, { error: "That dashboard is gone." });
			}
			existing.update(definition);
			return { saved: existing.id };
		}
		return { saved: DashboardDTO.create(locals.user.id, definition).id };
	},
	remove: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(idSchema, await request.formData());
		if (parsed.success) {
			DashboardDTO.find(parsed.data.id, locals.user.id)?.delete();
		}
		return { removed: true };
	},
};
