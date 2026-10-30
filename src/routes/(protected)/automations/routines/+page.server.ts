import { fail } from "@sveltejs/kit";

import { AutomationDTO } from "#lib/dto/automation.js";
import { library } from "#lib/server/automations/library.js";
import { devices } from "#lib/server/devices/devices.js";
import { homes } from "#lib/server/house/homes.js";
import {
	automationFormSchema,
	automationToggleSchema,
} from "#lib/server/validation/automation.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";

export const load = async ({ parent }) => {
	const { home } = await parent();
	return {
		automations: AutomationDTO.inHome(home.id).map((automation) =>
			automation.toJSON(),
		),
		hasLocation: home.place !== null,
	};
};

export const actions = {
	save: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(automationFormSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, {
				errors: parsed.errors,
				error: Object.values(parsed.errors).flat()[0],
			});
		}
		try {
			library.saveRoutine(
				homes.current(cookies).id,
				parsed.data.id,
				parsed.data.definition,
			);
		} catch (failure) {
			return fail(400, { error: devices.message(failure) });
		}
		return { saved: true };
	},
	toggle: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(automationToggleSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a routine." });
		}
		try {
			library.enableRoutine(
				homes.current(cookies).id,
				parsed.data.id,
				parsed.data.enabled,
			);
		} catch (failure) {
			return fail(404, { error: devices.message(failure) });
		}
		return { enabled: parsed.data.enabled };
	},
	run: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(idSchema, await request.formData());
		try {
			library.runRoutine(
				homes.current(cookies).id,
				parsed.success ? parsed.data.id : "",
			);
		} catch (failure) {
			return fail(404, { error: devices.message(failure) });
		}
		return { queued: true };
	},
	remove: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(idSchema, await request.formData());
		if (parsed.success) {
			library.removeRoutine(homes.current(cookies).id, parsed.data.id);
		}
		return { removed: true };
	},
};
