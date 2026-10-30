import { assistant } from "#lib/server/assistant/assistant.js";

export const load = async ({ parent }) => {
	await parent();
	return { configured: assistant.configured() };
};
