import { command, query } from "$app/server";
import { error } from "@sveltejs/kit";
import { z } from "zod";

import { access } from "#lib/server/auth/access.js";
import { deviceAdmin } from "#lib/server/devices/device-admin.js";
import { devices } from "#lib/server/devices/devices.js";
import { pluginManager } from "#lib/server/plugins/manager.js";
import {
	fieldChoicesSchema,
	pluginLinkSchema,
} from "#lib/server/validation/plugins.js";

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

export const testDevice = command(
	z.record(z.string(), z.string().max(4000)),
	async (form) => {
		requireAdmin();
		const outcome = await deviceAdmin.test(form);
		return outcome.ok
			? { ok: true as const, message: outcome.value }
			: {
					ok: false as const,
					error: outcome.error ?? null,
					errors: outcome.errors ?? {},
				};
	},
);

export const pluginChoices = query(fieldChoicesSchema, async (input) => {
	requireAdmin();
	const outcome = await deviceAdmin.choices(input);
	if (!outcome.ok) {
		error(outcome.status, outcome.error ?? "Check the form.");
	}
	return outcome.value;
});
