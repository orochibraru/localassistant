import { json } from "@sveltejs/kit";

import { assistant } from "#lib/server/assistant/assistant.js";
import { access } from "#lib/server/auth/access.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import { assistantTurnsSchema } from "#lib/server/validation/assistant.js";

export const POST = async ({ request, url }) => {
	access.requireUser();
	const { turns } = await mobileApi.body(request, assistantTurnsSchema);
	return json(await assistant.answer(mobileApi.home(url), turns));
};
