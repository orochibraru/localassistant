import { z } from "zod";

import { sceneActionPrefix } from "#lib/notifications.js";
import { stateTestSchema } from "#lib/server/validation/automation.js";

export const notificationActionSchema = z.object({
	action: z
		.string()
		.startsWith(sceneActionPrefix)
		.min(sceneActionPrefix.length + 1)
		.max(100),
});

export const notificationRuleSchema = z.object({
	test: z
		.string()
		.transform((text, context) => {
			try {
				return JSON.parse(text) as unknown;
			} catch {
				context.addIssue({ code: "custom", message: "That form is broken." });
				return z.NEVER;
			}
		})
		.pipe(stateTestSchema),
});
