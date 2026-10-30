import { z } from "zod";

import { assistantRoles } from "#lib/assistant.js";

export const assistantTurnsSchema = z.object({
	turns: z
		.array(
			z.object({
				role: z.enum(assistantRoles),
				text: z
					.string()
					.trim()
					.min(1)
					.max(4000, "Keep it under 4,000 characters."),
			}),
		)
		.min(1)
		.max(40, "That conversation is long: start a new one.")
		.refine((turns) => turns.at(-1)?.role === "user", "Ask something."),
});

export const assistantKeySchema = z.object({
	apiKey: z
		.string()
		.trim()
		.regex(/^sk-ant-[\w-]{20,}$/, "Paste a Claude API key, starting sk-ant-."),
});

export const aiVisibilitySchema = z.object({
	deviceId: z.string().trim().min(1),
	visible: z.stringbool().default(false),
});
