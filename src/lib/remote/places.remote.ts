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
