import { z } from "zod";

import { tuyaProtocolVersions } from "#lib/devices.js";
import { planSize, roomIcons } from "#lib/house.js";
import { deviceKinds } from "#lib/server/db/schema.js";

const name = z.string().trim().min(1).max(60);
const dataPoint = z.number().int().min(1).max(255);

const roomReference = z.object({
	name,
	floor: name.nullable(),
	outdoor: z.boolean(),
});

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
	);

export const houseConfigSchema = z.object({
	format: z.literal("localassistant-house"),
	version: z.literal(1),
	exportedAt: z.string().optional(),
	home: z.object({ name }).optional(),
	floors: z
		.array(
			z.object({
				name,
				level: z.number().int().min(-5).max(30),
				planBase: z.boolean().optional(),
			}),
		)
		.max(50)
		.default([]),
	rooms: z
		.array(
			roomReference.extend({
				icon: z.enum(roomIcons).catch("door"),
				plan: z.array(planPart).min(1).max(12).nullable().optional(),
			}),
		)
		.max(500)
		.default([]),
	devices: z
		.array(
			z.object({
				kind: z.enum(deviceKinds).exclude(["app"]),
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
				pin: z
					.object({
						floor: name.nullable(),
						outdoor: z.boolean(),
						x: z.number().min(0).max(planSize.columns),
						y: z.number().min(0).max(planSize.rows),
					})
					.nullable()
					.optional(),
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
