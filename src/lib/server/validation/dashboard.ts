import { z } from "zod";

import { historyRanges } from "#lib/history.js";

const id = z.string().trim().min(1);

export const dashboardSectionSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("heading"),
		text: z
			.string()
			.trim()
			.min(1, "Type the heading.")
			.max(60, "Keep it under 60 characters."),
	}),
	z.object({
		type: z.literal("devices"),
		deviceIds: z.array(id).min(1, "Pick at least one device.").max(100),
	}),
	z.object({
		type: z.literal("scenes"),
		sceneIds: z.array(id).min(1, "Pick at least one scene.").max(50),
	}),
	z.object({ type: z.literal("weather") }),
	z.object({ type: z.literal("people") }),
	z.object({
		type: z.literal("graph"),
		deviceId: id,
		range: z.enum(historyRanges),
	}),
]);

export const dashboardSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name the dashboard.")
		.max(40, "Keep it under 40 characters."),
	sections: z
		.array(dashboardSectionSchema)
		.min(1, "Add something to show.")
		.max(30, "That's a lot: split it in two."),
});

export const dashboardFormSchema = z.object({
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
		.pipe(dashboardSchema),
});
