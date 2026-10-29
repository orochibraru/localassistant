import { z } from "zod";

import {
	blindMoves,
	dayParts,
	measures,
	seasons,
	stateChecks,
	sunEvents,
	thresholdDirections,
} from "#lib/automations.js";
import {
	climateModes,
	coverActions,
	mediaActions,
	printerCommands,
	printerSpeeds,
	vacuumCommands,
} from "#lib/devices.js";

const deviceId = z.string().trim().min(1, "Pick a device.");
const monthDay = z
	.string()
	.regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Pick a day.");

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time.");
const percent = z.number().min(0).max(100);
const weekdayList = z
	.array(z.number().int().min(0).max(6))
	.min(1, "Pick at least one day.");

export const deviceCommandSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("cover"),
		move: z.union([
			z.object({ action: z.enum(coverActions) }),
			z.object({ position: z.number().int().min(0).max(100) }),
		]),
	}),
	z.object({
		type: z.literal("climate"),
		change: z.object({
			power: z.boolean().optional(),
			mode: z.enum(climateModes).optional(),
			targetTemperature: z.number().min(5).max(35).optional(),
		}),
	}),
	z.object({
		type: z.literal("printer"),
		change: z.object({
			command: z.enum(printerCommands).optional(),
			light: z.boolean().optional(),
			speed: z.literal(printerSpeeds).optional(),
		}),
	}),
	z.object({
		type: z.literal("vacuum"),
		change: z.object({ command: z.enum(vacuumCommands).optional() }),
	}),
	z.object({ type: z.literal("valve"), target: z.number().min(4).max(35) }),
	z.object({ type: z.literal("switch"), on: z.boolean() }),
	z.object({
		type: z.literal("light"),
		change: z.object({
			on: z.boolean().optional(),
			brightness: percent.optional(),
			temperature: z.number().int().min(1000).max(10_000).optional(),
			color: z
				.object({ hue: z.number().min(0).max(360), saturation: percent })
				.optional(),
		}),
	}),
	z.object({ type: z.literal("lock"), locked: z.boolean() }),
	z.object({
		type: z.literal("fan"),
		change: z.object({
			on: z.boolean().optional(),
			speed: percent.optional(),
			oscillating: z.boolean().optional(),
		}),
	}),
	z.object({
		type: z.literal("media"),
		change: z.object({
			power: z.boolean().optional(),
			action: z.enum(mediaActions).optional(),
			volume: percent.optional(),
			muted: z.boolean().optional(),
			source: z.string().trim().min(1).max(120).optional(),
		}),
	}),
	z.object({ type: z.literal("button") }),
]);

export const stateTestSchema = z
	.object({
		deviceId,
		check: z.enum(stateChecks),
		value: z.number().min(-100_000).max(100_000).nullable(),
	})
	.refine((test) => !measures(test.check) || test.value !== null, {
		message: "Type the value to compare with.",
		path: ["value"],
	});

export const conditionSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("device"), test: stateTestSchema }),
	z.object({ type: z.literal("time"), from: time, to: time }),
	z.object({ type: z.literal("weekdays"), weekdays: weekdayList }),
	z.object({ type: z.literal("sun"), when: z.enum(dayParts) }),
]);

export const triggerSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("sun"),
		event: z.enum(sunEvents),
		offsetMinutes: z.number().int().min(-240).max(240),
	}),
	z.object({ type: z.literal("time"), time, weekdays: weekdayList }),
	z.object({
		type: z.literal("temperature"),
		direction: z.enum(thresholdDirections),
		threshold: z.number("Type a temperature.").min(-40).max(50),
	}),
	z.object({
		type: z.literal("contact"),
		deviceIds: z
			.array(deviceId)
			.min(1, "Pick at least one door or window sensor.")
			.max(100),
	}),
	z.object({ type: z.literal("device"), test: stateTestSchema }),
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
		type: z.literal("device"),
		deviceId,
		command: deviceCommandSchema,
	}),
	z.object({
		type: z.literal("scene"),
		sceneId: z.string().trim().min(1, "Pick a scene."),
	}),
	z.object({
		type: z.literal("delay"),
		minutes: z
			.number("Type how many minutes.")
			.int()
			.min(1)
			.max(1440, "Wait a day at most."),
	}),
	z.object({
		type: z.literal("heating"),
		deviceIds: z
			.array(deviceId)
			.min(1, "Pick at least one heat pump or radiator valve.")
			.max(100),
		degrees: z.number("Type how many degrees.").min(0.5).max(10),
	}),
	z.object({
		type: z.literal("valves"),
		deviceIds: z
			.array(deviceId)
			.min(1, "Pick at least one radiator valve.")
			.max(100),
	}),
]);

export const automationSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, "Name the automation.")
			.max(60, "Keep it under 60 characters."),
		trigger: triggerSchema,
		period: periodSchema,
		conditions: z
			.array(conditionSchema)
			.max(10, "That's a lot: keep it to ten conditions.")
			.default([]),
		actions: z
			.array(automationActionSchema)
			.min(1, "Add something for it to do.")
			.max(20, "That's a lot: split it in two."),
	})
	.refine(
		(automation) =>
			automation.trigger.type === "contact" ||
			automation.actions.every(
				(action) => action.type !== "valves" && action.type !== "heating",
			),
		{
			message:
				"Radiator valves and turning the heating down follow a door or window: pick that trigger.",
			path: ["actions"],
		},
	);

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

export const automationToggleSchema = z.object({
	id: z.string().trim().min(1),
	enabled: z.stringbool().default(false),
});
