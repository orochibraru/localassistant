import { z } from "zod";

import {
	climateModes,
	coverActions,
	tuyaProtocolVersions,
} from "#lib/devices.js";

const deviceId = z.string().trim().min(1, "Pick a device.");

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

export const melCloudAccountSchema = z.object({
	email: z.email("Type your MELCloud email."),
	password: z.string().min(1, "Type your MELCloud password.").max(200),
});

export const renameDeviceSchema = z.object({
	id: deviceId,
	name: z.string().trim().min(1, "Name the device.").max(60),
});
