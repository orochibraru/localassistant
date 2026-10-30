import { fail } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { library } from "#lib/server/automations/library.js";
import { devices } from "#lib/server/devices/devices.js";
import { homes } from "#lib/server/house/homes.js";
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
		const parsed = parseForm(sceneFormSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, {
				errors: parsed.errors,
				error: Object.values(parsed.errors).flat()[0],
			});
		}
		try {
			library.saveScene(
				homes.current(cookies).id,
				parsed.data.id,
				parsed.data.definition,
			);
		} catch (failure) {
			return fail(400, { error: devices.message(failure) });
		}
		return { saved: true };
	},
	remove: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(idSchema, await request.formData());
		if (parsed.success) {
			library.removeScene(homes.current(cookies).id, parsed.data.id);
		}
		return { removed: true };
	},
};
