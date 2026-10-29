import { query } from "$app/server";
import { error } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { devices } from "#lib/server/devices/devices.js";
import { pluginManager } from "#lib/server/plugins/manager.js";
import { pluginLinkSchema } from "#lib/server/validation/plugins.js";

function requireAdmin(): void {
	if (!access.isAdmin(access.requireUser())) {
		error(403, "Only admins can do that.");
	}
}

export const lookUpPlugin = query(pluginLinkSchema, async ({ link }) => {
	requireAdmin();
	try {
		return await pluginManager.preview(link);
	} catch (failure) {
		error(400, devices.message(failure));
	}
});

export const browsePlugins = query(async () => {
	requireAdmin();
	try {
		return await pluginManager.browse();
	} catch (failure) {
		error(502, devices.message(failure));
	}
});
