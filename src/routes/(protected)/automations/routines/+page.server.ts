import { fail } from "@sveltejs/kit";

import { checksFor } from "#lib/automations.js";
import { AutomationRunDTO } from "#lib/dto/automation-run.js";
import {
	type AutomationDefinition,
	AutomationDTO,
} from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { RoomDTO } from "#lib/dto/room.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { UserDTO } from "#lib/dto/user.js";
import { kindInfo, type PluginCard } from "#lib/plugins.js";
import { homes } from "#lib/server/house/homes.js";
import { plugins } from "#lib/server/plugins/registry.js";
import {
	automationFormSchema,
	automationToggleSchema,
} from "#lib/server/validation/automation.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";

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
	const watchable = (deviceId: string, check: string) => {
		const card = cardOf(deviceId);
		return card !== null && checksFor(card).some((entry) => entry === check);
	};
	const { trigger } = definition;
	if (trigger.type === "contact" && !allOf(trigger.deviceIds, "contact")) {
		return "A door or window sensor it watches is gone.";
	}
	if (
		trigger.type === "device" &&
		!watchable(trigger.test.deviceId, trigger.test.check)
	) {
		return "The device it watches is gone, or can't be watched for that.";
	}
	for (const condition of definition.conditions) {
		if (
			condition.type === "device" &&
			!watchable(condition.test.deviceId, condition.test.check)
		) {
			return "A device one of its conditions looks at is gone.";
		}
	}
	for (const action of definition.actions) {
		if (action.type === "valves" && !allOf(action.deviceIds, "valve")) {
			return "A radiator valve it closes is gone.";
		}
		if (
			action.type === "heating" &&
			!allOf(action.deviceIds, "valve", "climate")
		) {
			return "A heater it turns down is gone.";
		}
		if (
			action.type === "blinds" &&
			action.roomId !== null &&
			!RoomDTO.find(action.roomId, homeId)
		) {
			return "A room it moves the blinds of is gone.";
		}
		if (action.type === "scene" && !SceneDTO.find(action.sceneId, homeId)) {
			return "A scene it sets is gone.";
		}
		if (action.type === "notify") {
			if (
				action.who !== "everyone" &&
				action.who !== "admins" &&
				!UserDTO.people().some((person) => person.id === action.who)
			) {
				return "The account it tells is gone.";
			}
			if (action.sceneIds.some((sceneId) => !SceneDTO.find(sceneId, homeId))) {
				return "A scene its notification offers is gone.";
			}
		}
		if (
			action.type === "device" &&
			!allOf([action.deviceId], action.command.type)
		) {
			return "A device it drives is gone, or can't take that.";
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
			AutomationRunDTO.cancelWaiting(existing.id);
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
		if (!parsed.data.enabled) {
			AutomationRunDTO.cancelWaiting(automation.id);
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
