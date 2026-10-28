import { fail } from "@sveltejs/kit";

import { AppearanceDTO } from "#lib/dto/appearance.js";
import { appearanceSchema } from "#lib/server/validation/appearance.js";
import { parseForm } from "#lib/server/validation/form.js";

export const actions = {
	default: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(appearanceSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		AppearanceDTO.save(locals.user.id, parsed.data);
		return { saved: true };
	},
};
