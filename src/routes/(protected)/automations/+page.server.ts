import { fail } from "@sveltejs/kit";

import {
	type AutomationDefinition,
	AutomationDTO,
} from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { RoomDTO } from "#lib/dto/room.js";
import { kindInfo, type PluginCard } from "#lib/plugins.js";
import { homes } from "#lib/server/house/homes.js";
import { plugins } from "#lib/server/plugins/registry.js";
import {
	automationFormSchema,
	automationToggleSchema,
} from "#lib/server/validation/automation.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";

const actionCards: Record<"climate" | "printer" | "vacuum", PluginCard> = {
	climate: "climate",
	printer: "printer",
	vacuum: "vacuum",
};

function brokenReference(
	homeId: string,
	definition: AutomationDefinition,
): string | null {
	const catalog = plugins.catalog();
	const cardOf = (deviceId: string) => {
		const device = DeviceDTO.find(deviceId, homeId);
		return device ? kindInfo(catalog, device.kind).card : null;
	};
	const allOf = (deviceIds: string[], ...cards: PluginCard[]) =>
		deviceIds.every((deviceId) => {
			const card = cardOf(deviceId);
			return card !== null && cards.includes(card);
		});
	if (
		definition.trigger.type === "contact" &&
		!allOf(definition.trigger.deviceIds, "contact")
	) {
		return "A door or window sensor it watches is gone.";
	}
	for (const action of definition.actions) {
		if (action.type === "valves") {
			if (!allOf(action.deviceIds, "valve")) {
				return "A radiator valve it closes is gone.";
			}
			continue;
		}
		if (action.type === "heating") {
			if (!allOf(action.deviceIds, "valve", "climate")) {
				return "A heater it turns down is gone.";
			}
			continue;
		}
		if (action.type === "blinds") {
			if (action.roomId !== null && !RoomDTO.find(action.roomId, homeId)) {
				return "A room it moves the blinds of is gone.";
			}
			continue;
		}
		if (!allOf([action.deviceId], actionCards[action.type])) {
			return "A device it drives is gone.";
		}
	}
	return null;
}

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
		const home = homes.current(cookies);
		const parsed = parseForm(automationFormSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, {
				errors: parsed.errors,
				error: Object.values(parsed.errors).flat()[0],
			});
		}
		const { id, definition } = parsed.data;
		const broken = brokenReference(home.id, definition);
		if (broken) {
			return fail(400, { error: broken });
		}
		if (id) {
			const existing = AutomationDTO.find(id, home.id);
			if (!existing) {
				return fail(404, { error: "That routine is gone." });
			}
			existing.update(definition);
		} else {
			AutomationDTO.create(home.id, definition);
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
		const automation = AutomationDTO.find(
			parsed.data.id,
			homes.current(cookies).id,
		);
		if (!automation) {
			return fail(404, { error: "That routine is gone." });
		}
		automation.setEnabled(parsed.data.enabled);
		return { enabled: parsed.data.enabled };
	},
	run: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(idSchema, await request.formData());
		const automation = parsed.success
			? AutomationDTO.find(parsed.data.id, homes.current(cookies).id)
			: undefined;
		if (!automation) {
			return fail(404, { error: "That routine is gone." });
		}
		JobDTO.enqueue(
			"automation.run",
			{ automationId: automation.id },
			{ maxAttempts: 1 },
		);
		return { queued: true };
	},
	remove: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(idSchema, await request.formData());
		if (parsed.success) {
			AutomationDTO.find(parsed.data.id, homes.current(cookies).id)?.delete();
		}
		return { removed: true };
	},
};
