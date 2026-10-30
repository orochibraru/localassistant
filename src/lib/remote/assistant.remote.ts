import { command, getRequestEvent } from "$app/server";
import Anthropic from "@anthropic-ai/sdk";
import { error } from "@sveltejs/kit";

import { assistant } from "#lib/server/assistant/assistant.js";
import { access } from "#lib/server/auth/access.js";
import { Logger } from "#lib/server/core/logger.js";
import { homes } from "#lib/server/house/homes.js";
import { assistantTurnsSchema } from "#lib/server/validation/assistant.js";

const logger = new Logger("Assistant");

export const askAssistant = command(assistantTurnsSchema, async ({ turns }) => {
	access.requireUser();
	if (!assistant.configured()) {
		error(409, "An admin has to add a Claude API key first, in Admin, AI.");
	}
	try {
		return await assistant.reply(
			homes.current(getRequestEvent().cookies),
			turns,
		);
	} catch (failure) {
		if (failure instanceof Anthropic.AuthenticationError) {
			error(502, "The Claude API refused the key: an admin has to replace it.");
		}
		if (failure instanceof Anthropic.RateLimitError) {
			error(503, "The Claude API is busy right now. Try again in a minute.");
		}
		logger.warn("The assistant failed", undefined, failure);
		error(502, "The Claude API can't be reached right now.");
	}
});
