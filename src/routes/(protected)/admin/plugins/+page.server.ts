import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { getSetting, setSetting } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";
import { gitHub } from "#lib/server/plugins/github.js";
import { pluginManager } from "#lib/server/plugins/manager.js";
import { parseForm } from "#lib/server/validation/form.js";
import {
	gitHubTokenSchema,
	pluginIdSchema,
	pluginLinkSchema,
} from "#lib/server/validation/plugins.js";

const enabledSchema = pluginIdSchema.extend({ enabled: z.stringbool() });

export const load = async ({ parent }) => {
	await parent();
	return {
		plugins: pluginManager.summaries(),
		hasGitHubToken: getSetting("githubToken") !== null,
	};
};

export const actions = {
	install: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(pluginLinkSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			const row = await pluginManager.install(parsed.data.link);
			return { installed: row.manifest.name };
		} catch (failure) {
			return fail(400, { error: devices.message(failure) });
		}
	},
	update: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(pluginIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick an integration." });
		}
		try {
			const row = await pluginManager.update(parsed.data.plugin);
			return { updated: row.manifest.version };
		} catch (failure) {
			return fail(400, { error: devices.message(failure) });
		}
	},
	remove: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(pluginIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick an integration." });
		}
		return { removed: await pluginManager.remove(parsed.data.plugin) };
	},
	enable: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(enabledSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick an integration." });
		}
		pluginManager.setEnabled(parsed.data.plugin, parsed.data.enabled);
		return { enabled: parsed.data.enabled };
	},
	saveToken: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(gitHubTokenSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			await gitHub.checkToken(parsed.data.token);
		} catch (failure) {
			return fail(400, { errors: { token: [devices.message(failure)] } });
		}
		setSetting("githubToken", {
			encryptedToken: secrets.encrypt(parsed.data.token),
		});
		return { saved: true };
	},
	removeToken: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		setSetting("githubToken", null);
		return { removed: true };
	},
	check: async ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		return { checked: await pluginManager.check() };
	},
};
