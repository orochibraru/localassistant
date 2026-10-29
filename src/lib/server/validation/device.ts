import { z } from "zod";

import {
	cardSizes,
	climateModes,
	coverActions,
	printerCommands,
	printerSpeeds,
	vacuumCommands,
	vacuumModes,
	vacuumParts,
	vacuumSuctions,
	vacuumWetness,
} from "#lib/devices.js";
import { noFloorPlace, outsidePlace, planSize, roomIcons } from "#lib/house.js";

const deviceId = z.string().trim().min(1, "Pick a device.");

export const wholeHouse = "house";

const roomId = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value && value !== wholeHouse ? value : null));

const roomName = z
	.string()
	.trim()
	.min(1, "Name the room.")
	.max(40, "Keep it under 40 characters.")
	.refine(
		(name) =>
			name.toLowerCase() !== wholeHouse && name.toLowerCase() !== "whole house",
		"That name is taken by the whole house.",
	);

export const coverActionSchema = z.object({
	deviceId,
	action: z.enum(coverActions),
});

export const coverGroupSchema = z.object({
	roomId: z.string().trim().min(1).nullable(),
	action: z.enum(coverActions),
});

export const coverPositionSchema = z.object({
	deviceId,
	position: z.number().int().min(0).max(100),
});

export const climateChangeSchema = z
	.object({
		deviceId,
		power: z.boolean().optional(),
		mode: z.enum(climateModes).optional(),
		targetTemperature: z.number().min(5).max(35).optional(),
		hotWaterBoost: z.boolean().optional(),
	})
	.refine(
		(change) => Object.keys(change).some((key) => key !== "deviceId"),
		"Say what to change.",
	);

export const printerChangeSchema = z
	.object({
		deviceId,
		command: z.enum(printerCommands).optional(),
		light: z.boolean().optional(),
		speed: z.literal(printerSpeeds).optional(),
	})
	.refine(
		(change) => Object.keys(change).some((key) => key !== "deviceId"),
		"Say what to change.",
	);

export const vacuumChangeSchema = z
	.object({
		deviceId,
		command: z.enum(vacuumCommands).optional(),
		mode: z.enum(vacuumModes).optional(),
		suction: z.enum(vacuumSuctions).optional(),
		wetness: z.int().min(vacuumWetness.min).max(vacuumWetness.max).optional(),
		cleanGenius: z.boolean().optional(),
		reset: z.enum(vacuumParts).optional(),
	})
	.refine(
		(change) => Object.keys(change).some((key) => key !== "deviceId"),
		"Say what to change.",
	);

export const valveTargetSchema = z.object({
	deviceId,
	target: z.number().min(4).max(35),
});

export const switchPowerSchema = z.object({ deviceId, on: z.boolean() });

const place = z
	.string()
	.trim()
	.default(noFloorPlace)
	.transform((value) => ({
		floorId: value === outsidePlace || value === noFloorPlace ? null : value,
		outdoor: value === outsidePlace,
	}));

export const roomSettingsSchema = z
	.object({
		name: roomName,
		icon: z.enum(roomIcons, "Pick an icon.").default("door"),
		place,
	})
	.transform(({ place: where, ...rest }) => ({ ...rest, ...where }));

export const editRoomSchema = z
	.object({
		id: z.string().trim().min(1, "Pick a room."),
		name: roomName,
		icon: z.enum(roomIcons, "Pick an icon.").default("door"),
		place,
	})
	.transform(({ place: where, ...rest }) => ({ ...rest, ...where }));

const floorName = z
	.string()
	.trim()
	.min(1, "Name the floor.")
	.max(40, "Keep it under 40 characters.");

export const floorSchema = z.object({
	name: floorName,
	level: z.coerce
		.number("Type the floor's level.")
		.int()
		.min(-5, "That's very deep.")
		.max(30, "That's very high."),
});

export const editFloorSchema = floorSchema.extend({
	id: z.string().trim().min(1, "Pick a floor."),
});

export const nobody = "nobody";

const deviceName = z.string().trim().min(1, "Name the device.").max(60);

export const appDeviceSchema = z.object({ name: deviceName });

export const editAppDeviceSchema = z.object({
	id: deviceId,
	name: deviceName,
	roomId,
	ownerId: z
		.string()
		.trim()
		.optional()
		.transform((value) => (value && value !== nobody ? value : null)),
});

export const appReportSchema = z.object({
	deviceId,
	battery: z.number().int().min(0).max(100).nullable(),
	charging: z.boolean().nullable(),
	platform: z.string().trim().max(80),
	location: z
		.object({
			latitude: z.number().min(-90).max(90),
			longitude: z.number().min(-180).max(180),
			accuracy: z.number().min(0).max(1_000_000).nullable(),
		})
		.nullable()
		.optional(),
});

export const cardSizeSchema = z.object({ deviceId, size: z.enum(cardSizes) });

const planPart = z
	.object({
		x: z
			.int()
			.min(0)
			.max(planSize.columns - 1),
		y: z
			.int()
			.min(0)
			.max(planSize.rows - 1),
		width: z.int().min(1).max(planSize.columns),
		height: z.int().min(1).max(planSize.rows),
	})
	.refine(
		(part) =>
			part.x + part.width <= planSize.columns &&
			part.y + part.height <= planSize.rows,
		"Keep the room inside the plan.",
	);

export const planChangesSchema = z.object({
	rooms: z
		.array(
			z.object({
				roomId: z.string().trim().min(1, "Pick a room."),
				plan: z
					.array(planPart)
					.min(1)
					.max(12, "Keep a room to 12 parts.")
					.nullable(),
			}),
		)
		.max(500),
	moves: z.array(z.object({ deviceId, roomId })).max(500),
	pins: z
		.array(
			z.object({
				deviceId,
				pin: z
					.object({
						place: z.string().trim().min(1),
						x: z.number().min(0).max(planSize.columns),
						y: z.number().min(0).max(planSize.rows),
					})
					.nullable(),
			}),
		)
		.max(500)
		.default([]),
	baseFloorId: z.string().trim().min(1).nullable().optional(),
});

export const cardOrderSchema = z.object({
	deviceIds: z.array(deviceId).max(1000),
});

export const cardDetailsSchema = z.object({ deviceId, shown: z.boolean() });
