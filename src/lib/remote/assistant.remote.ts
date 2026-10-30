import { command, getRequestEvent } from "$app/server";

import { assistant } from "#lib/server/assistant/assistant.js";
import { access } from "#lib/server/auth/access.js";
import { homes } from "#lib/server/house/homes.js";
import { assistantTurnsSchema } from "#lib/server/validation/assistant.js";

export const askAssistant = command(assistantTurnsSchema, ({ turns }) => {
	access.requireUser();
	return assistant.answer(homes.current(getRequestEvent().cookies), turns);
});
