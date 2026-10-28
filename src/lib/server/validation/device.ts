import { z } from "zod";

import {
	climateModes,
	coverActions,
	printerCommands,
	printerSpeeds,
	tuyaProtocolVersions,
} from "#lib/devices.js";
import { noFloorPlace, outsidePlace, roomIcons } from "#lib/house.js";

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

function dataPoint(fallback: number) {
	return z
		.string()
		.trim()
		.optional()
		.transform((value) => (value ? Number(value) : fallback))
		.pipe(z.number("Type a data point number.").int().min(1).max(255));
}

export const coverActionSchema = z.object({
	deviceId,
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

export const tuyaCoverSchema = z.object({
	name: z.string().trim().min(1, "Name the blind.").max(60),
	roomId,
	externalId: z
		.string()
		.trim()
		.regex(/^[A-Za-z0-9]{10,32}$/, "Paste the device ID from Tuya."),
	host: z
		.string()
		.trim()
		.regex(
			/^(\d{1,3}\.){3}\d{1,3}$|^[A-Za-z0-9.-]+$/,
			"Type the blind's IP address on your network.",
		),
	localKey: z
		.string()
		.trim()
		.min(16, "Paste the 16-character local key from Tuya.")
		.max(64),
	protocolVersion: z.enum(tuyaProtocolVersions).default("3.3"),
	inverted: z.stringbool().default(false),
	controlDp: dataPoint(1),
	positionDp: dataPoint(2),
	positionStateDp: dataPoint(3),
});

export const editTuyaCoverSchema = tuyaCoverSchema
	.omit({ externalId: true, localKey: true })
	.extend({
		id: deviceId,
		localKey: z
			.string()
			.trim()
			.optional()
			.transform((value) => value || undefined)
			.pipe(
				z
					.string()
					.min(16, "Paste the 16-character local key from Tuya.")
					.max(64)
					.optional(),
			),
	});

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

const printerHost = z
	.string()
	.trim()
	.regex(
		/^(\d{1,3}\.){3}\d{1,3}$|^[A-Za-z0-9.-]+$/,
		"Type the printer's IP address on your network.",
	);

const accessCode = z
	.string()
	.trim()
	.regex(
		/^[A-Za-z0-9]{8}$/,
		"Type the 8-character access code from the printer's network settings.",
	);

export const bambuPrinterSchema = z.object({
	name: z.string().trim().min(1, "Name the printer.").max(60),
	roomId,
	host: printerHost,
	externalId: z
		.string()
		.trim()
		.toUpperCase()
		.regex(
			/^[A-Z0-9]{12,20}$/,
			"Type the serial number from the printer's settings.",
		),
	accessCode,
});

export const editBambuPrinterSchema = z.object({
	id: deviceId,
	name: z.string().trim().min(1, "Name the printer.").max(60),
	roomId,
	host: printerHost,
	accessCode: z
		.string()
		.trim()
		.optional()
		.transform((value) => value || undefined)
		.pipe(accessCode.optional()),
});

export const melCloudAccountSchema = z.object({
	email: z.email("Type your MELCloud email."),
	password: z.string().min(1, "Type your MELCloud password.").max(200),
});

export const renameDeviceSchema = z.object({
	id: deviceId,
	name: z.string().trim().min(1, "Name the device.").max(60),
	roomId,
});

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
