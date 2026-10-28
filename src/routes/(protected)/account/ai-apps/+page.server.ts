import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { AiAppDTO } from "#lib/dto/ai-app.js";
import { authService } from "#lib/server/auth/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

const revokeSchema = z.object({ clientId: z.string().min(1) });

export const load = async ({ parent, url }) => {
	const { user } = await parent();
	return {
		mcpUrl:
			authService.mcpResource(authService.publicOrigin() ?? url.origin) ?? null,
		apps: AiAppDTO.forUser(user.id).map((entry) => entry.toJSON()),
	};
};

export const actions = {
	revoke: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(revokeSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick an app." });
		}
		AiAppDTO.revoke(locals.user.id, parsed.data.clientId);
		return { revoked: true };
	},
};
