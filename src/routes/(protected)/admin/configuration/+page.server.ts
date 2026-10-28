import { fail } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { homes } from "#lib/server/house/homes.js";
import { houseConfiguration } from "#lib/server/house/house-config.js";
import { houseConfigSchema } from "#lib/server/validation/house-config.js";

const maxBytes = 1024 * 1024;

export const load = async ({ parent }) => {
	await parent();
	return {};
};

export const actions = {
	import: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const file = (await request.formData()).get("file");
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: "Pick a configuration file." });
		}
		if (file.size > maxBytes) {
			return fail(400, { error: "That file is too big for a configuration." });
		}
		let json: unknown;
		try {
			json = JSON.parse(await file.text());
		} catch {
			return fail(400, { error: "That file isn't JSON." });
		}
		const parsed = houseConfigSchema.safeParse(json);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			return fail(400, {
				error: `That isn't a LocalAssistant configuration (${issue?.path.join(".") || "file"}: ${issue?.message ?? "invalid"}).`,
			});
		}
		return houseConfiguration.import(homes.current(cookies), parsed.data);
	},
};
