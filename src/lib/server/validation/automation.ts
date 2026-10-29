import { z } from "zod";

import {
	blindMoves,
	presetKeys,
	seasons,
	sunEvents,
	thresholdDirections,
} from "#lib/automations.js";
import { climateModes, printerCommands, vacuumCommands } from "#lib/devices.js";

const deviceId = z.string().trim().min(1, "Pick a device.");
const monthDay = z
	.string()
	.regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Pick a day.");

export const triggerSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("sun"),
		event: z.enum(sunEvents),
		offsetMinutes: z.number().int().min(-240).max(240),
	}),
	z.object({
		type: z.literal("time"),
		time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time."),
		weekdays: z
			.array(z.number().int().min(0).max(6))
			.min(1, "Pick at least one day."),
	}),
	z.object({
		type: z.literal("temperature"),
		direction: z.enum(thresholdDirections),
		threshold: z.number("Type a temperature.").min(-40).max(50),
	}),
]);

export const periodSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("always") }),
	z.object({
		type: z.literal("seasons"),
		seasons: z.array(z.enum(seasons)).min(1, "Pick at least one season."),
	}),
	z.object({ type: z.literal("dates"), from: monthDay, to: monthDay }),
]);

export const automationActionSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("blinds"),
		roomId: z.string().trim().min(1).nullable(),
		move: z.enum(blindMoves),
		position: z.number().int().min(0).max(100).nullable(),
	}),
	z.object({
		type: z.literal("climate"),
		deviceId,
		power: z.boolean(),
		mode: z.enum(climateModes).nullable(),
		targetTemperature: z.number().min(5).max(35).nullable(),
	}),
	z.object({
		type: z.literal("printer"),
		deviceId,
		command: z.enum(printerCommands),
	}),
	z.object({
		type: z.literal("vacuum"),
		deviceId,
		command: z.enum(vacuumCommands),
	}),
]);

export const automationSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name the automation.")
		.max(60, "Keep it under 60 characters."),
	trigger: triggerSchema,
	period: periodSchema,
	actions: z
		.array(automationActionSchema)
		.min(1, "Add something for it to do.")
		.max(20, "That's a lot: split it in two."),
});

export const automationFormSchema = z.object({
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
		.pipe(automationSchema),
});

export const presetToggleSchema = z.object({
	key: z.enum(presetKeys),
	enabled: z.stringbool().default(false),
});

export const automationToggleSchema = z.object({
	id: z.string().trim().min(1),
	enabled: z.stringbool().default(false),
});
