import { fail } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { kindInfo } from "#lib/plugins.js";
import { homes } from "#lib/server/house/homes.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";
import { sceneFormSchema } from "#lib/server/validation/scene.js";

export const load = async ({ parent }) => {
	const { home } = await parent();
	return {
		states: Object.fromEntries(
			DeviceDTO.inHome(home.id).map((device) => [device.id, device.state]),
		),
	};
};

export const actions = {
	save: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const home = homes.current(cookies);
		const parsed = parseForm(sceneFormSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, {
				errors: parsed.errors,
				error: Object.values(parsed.errors).flat()[0],
			});
		}
		const { id, definition } = parsed.data;
		const catalog = plugins.catalog();
		const broken = definition.members.some((member) => {
			const device = DeviceDTO.find(member.deviceId, home.id);
			return (
				!device || kindInfo(catalog, device.kind).card !== member.command.type
			);
		});
		if (broken) {
			return fail(400, {
				error: "A device in the scene is gone, or can't take that.",
			});
		}
		if (id) {
			const existing = SceneDTO.find(id, home.id);
			if (!existing) {
				return fail(404, { error: "That scene is gone." });
			}
			existing.update(definition);
		} else {
			SceneDTO.create(home.id, definition);
		}
		return { saved: true };
	},
	remove: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(idSchema, await request.formData());
		if (parsed.success) {
			SceneDTO.find(parsed.data.id, homes.current(cookies).id)?.delete();
		}
		return { removed: true };
	},
};
