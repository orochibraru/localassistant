import { z } from "zod";

import { tuyaProtocolVersions } from "#lib/devices.js";
import { roomIcons } from "#lib/house.js";
import { deviceKinds } from "#lib/server/db/schema.js";

const name = z.string().trim().min(1).max(60);
const dataPoint = z.number().int().min(1).max(255);

const roomReference = z.object({
	name,
	floor: name.nullable(),
	outdoor: z.boolean(),
});

export const houseConfigSchema = z.object({
	format: z.literal("localassistant-house"),
	version: z.literal(1),
	exportedAt: z.string().optional(),
	home: z.object({ name }).optional(),
	floors: z
		.array(z.object({ name, level: z.number().int().min(-5).max(30) }))
		.max(50)
		.default([]),
	rooms: z
		.array(
			roomReference.extend({
				icon: z.enum(roomIcons).catch("door"),
			}),
		)
		.max(500)
		.default([]),
	devices: z
		.array(
			z.object({
				kind: z.enum(deviceKinds),
				name,
				externalId: z.string().trim().min(1).max(64),
				room: roomReference.nullable(),
				host: z.string().trim().max(255).nullable(),
				protocolVersion: z.enum(tuyaProtocolVersions).nullable(),
				inverted: z.boolean(),
				buildingId: z.number().int().nullable(),
				controlDp: dataPoint,
				positionDp: dataPoint,
				positionStateDp: dataPoint,
				secret: z.string().min(1).max(200).optional(),
			}),
		)
		.max(500)
		.default([]),
	melcloud: z
		.object({
			email: z.email(),
			password: z.string().min(1).max(200).optional(),
		})
		.nullable()
		.default(null),
});

export type HouseConfig = z.infer<typeof houseConfigSchema>;
