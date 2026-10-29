import { query } from "$app/server";
import { error } from "@sveltejs/kit";
import { z } from "zod";

import { access } from "#lib/server/auth/access.js";
import { weatherService } from "#lib/server/house/weather.js";

export const searchPlaces = query(
	z.string().trim().min(2).max(80),
	async (text) => {
		const user = access.requireUser();
		if (!access.isAdmin(user)) {
			error(403, "Only admins can do that.");
		}
		try {
			return await weatherService.search(text);
		} catch {
			error(502, "The place search can't be reached right now.");
		}
	},
);

export const weatherHere = query(
	z.object({
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
	}),
	async ({ latitude, longitude }) => {
		access.requireUser();
		try {
			return await weatherService.forecast({
				place: "Your location",
				latitude: Math.round(latitude * 100) / 100,
				longitude: Math.round(longitude * 100) / 100,
				timezone: "auto",
			});
		} catch {
			error(502, "The weather can't be reached right now.");
		}
	},
);
