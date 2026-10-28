import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { z } from "zod";

import { access } from "#lib/server/auth/access.js";
import { homes } from "#lib/server/house/homes.js";

export const chooseHome = command(z.string().min(1), (homeId) => {
	access.requireUser();
	const { cookies, url } = getRequestEvent();
	if (!homes.choose(cookies, url, homeId)) {
		error(404, "That home is gone.");
	}
});
