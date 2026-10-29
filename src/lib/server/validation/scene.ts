import { z } from "zod";

import { deviceCommandSchema } from "#lib/server/validation/automation.js";

export const sceneSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name the scene.")
		.max(60, "Keep it under 60 characters."),
	members: z
		.array(
			z.object({
				deviceId: z.string().trim().min(1, "Pick a device."),
				command: deviceCommandSchema,
			}),
		)
		.min(1, "Add a device for it to set.")
		.max(50, "That's a lot: split it in two."),
});

export const sceneFormSchema = z.object({
	id: z
		.string()
		.trim()
		.optional()
		.transform((value) => value || undefined),
	definition: z
		.string()
		.transform((text, context) => {
			try {
				return JSON.parse(text) as unknown;
			} catch {
				context.addIssue({ code: "custom", message: "That form is broken." });
				return z.NEVER;
			}
		})
		.pipe(sceneSchema),
});

export const sceneIdSchema = z.object({ sceneId: z.string().trim().min(1) });
