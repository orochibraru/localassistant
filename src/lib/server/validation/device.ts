import { z } from "zod";

import {
	cardSizes,
	climateModes,
	coverActions,
	dreameRegions,
	printerCommands,
	printerSpeeds,
	tuyaProtocolVersions,
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

export const dreameAccountSchema = z.object({
	email: z.email("Type your Dreamehome email."),
	password: z.string().min(1, "Type your Dreamehome password.").max(200),
	region: z.enum(dreameRegions, "Pick the region your app uses.").default("eu"),
});

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

export const mqttBrokerSchema = z.object({
	url: z
		.string()
		.trim()
		.regex(
			/^mqtts?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/,
			"Type the broker's address, like mqtt://192.168.1.10:1883.",
		),
	username: z
		.string()
		.trim()
		.max(100)
		.optional()
		.transform((value) => value || null),
	password: z
		.string()
		.max(200)
		.optional()
		.transform((value) => value || undefined),
	zigbeeTopic: z
		.string()
		.trim()
		.regex(/^[A-Za-z0-9_/-]{1,60}$/, "Type Zigbee2MQTT's base topic.")
		.default("zigbee2mqtt"),
});

const prm = z
	.string()
	.trim()
	.regex(/^\d{14}$/, "Type the 14-digit PRM from your bill or the meter.");
const linkyToken = z
	.string()
	.trim()
	.min(20, "Paste the token conso.boris.sh gave you.")
	.max(2000);

export const linkySchema = z.object({
	name: z.string().trim().min(1, "Name the meter.").max(60).default("Linky"),
	roomId,
	externalId: prm,
	token: linkyToken,
});

export const editLinkySchema = z.object({
	id: deviceId,
	name: z.string().trim().min(1, "Name the meter.").max(60),
	roomId,
	externalId: prm,
	token: z
		.literal("")
		.transform(() => undefined)
		.or(linkyToken)
		.optional(),
});

const rtspUrl = z
	.string()
	.trim()
	.regex(
		/^rtsps?:\/\/\S+$/,
		"Paste the camera's RTSP address, like rtsp://user:password@192.168.1.60:554/stream1.",
	);

const cameraOptions = {
	record: z.stringbool().default(false),
	retentionDays: z.coerce
		.number("Type a number of days.")
		.int()
		.min(1, "Keep at least a day.")
		.max(365, "A year at most.")
		.default(7),
};

export const cameraSchema = z.object({
	name: z.string().trim().min(1, "Name the camera.").max(60),
	roomId,
	url: rtspUrl,
	...cameraOptions,
});

export const editCameraSchema = z.object({
	id: deviceId,
	name: z.string().trim().min(1, "Name the camera.").max(60),
	roomId,
	url: z
		.string()
		.trim()
		.optional()
		.transform((value) => value || undefined)
		.pipe(rtspUrl.optional()),
	...cameraOptions,
});

export const frigateSchema = z.object({
	url: z
		.string()
		.trim()
		.regex(
			/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/?$/,
			"Type Frigate's address, like http://192.168.1.10:5000.",
		),
	notifyLabels: z
		.string()
		.trim()
		.default("person")
		.transform((value) =>
			value
				.split(",")
				.map((label) => label.trim().toLowerCase())
				.filter((label) => /^[a-z_]{1,30}$/.test(label)),
		),
});

const espHomeFields = {
	name: z.string().trim().min(1, "Name the unit.").max(60),
	roomId,
	host: z
		.string()
		.trim()
		.regex(
			/^(\d{1,3}\.){3}\d{1,3}$|^[A-Za-z0-9.-]+$/,
			"Type the adapter's IP address on your network.",
		),
	objectId: z
		.string()
		.trim()
		.regex(/^[a-z0-9_]{1,60}$/, "Type the climate's id, like living_room."),
	username: z
		.string()
		.trim()
		.max(60)
		.optional()
		.transform((value) => value || undefined),
	password: z
		.string()
		.max(200)
		.optional()
		.transform((value) => value || undefined),
};

export const espHomeSchema = z.object(espHomeFields);

export const editEspHomeSchema = z.object({ id: deviceId, ...espHomeFields });

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
