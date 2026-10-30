import { checksFor } from "#lib/automations.js";
import { AutomationRunDTO } from "#lib/dto/automation-run.js";
import {
	type AutomationDefinition,
	AutomationDTO,
} from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { RoomDTO } from "#lib/dto/room.js";
import { SceneDTO, type SceneRow } from "#lib/dto/scene.js";
import { UserDTO } from "#lib/dto/user.js";
import { kindInfo, type PluginCard } from "#lib/plugins.js";
import { plugins } from "#lib/server/plugins/registry.js";

/** Creates, changes, runs and removes a home's routines and scenes, checking what they point at still exists. */
class AutomationLibrary {
	/**
	 * Saves `definition` as a new routine of `homeId`, or over routine `id`, cancelling its waiting runs.
	 *
	 * @throws When it points at a device, room, scene or account that's gone, or routine `id` isn't in the home.
	 */
	saveRoutine(
		homeId: string,
		id: string | undefined,
		definition: AutomationDefinition,
	): AutomationDTO {
		const broken = this.#brokenReference(homeId, definition);
		if (broken) {
			throw new Error(broken);
		}
		if (!id) {
			return AutomationDTO.create(homeId, definition);
		}
		const existing = this.#routine(homeId, id);
		AutomationRunDTO.cancelWaiting(existing.id);
		existing.update(definition);
		return existing;
	}

	/**
	 * Turns routine `id` of `homeId` on or off; off cancels its waiting runs.
	 *
	 * @throws When the routine isn't in the home.
	 */
	enableRoutine(homeId: string, id: string, enabled: boolean): void {
		const automation = this.#routine(homeId, id);
		if (!enabled) {
			AutomationRunDTO.cancelWaiting(automation.id);
		}
		automation.setEnabled(enabled);
	}

	/**
	 * Has the worker run routine `id` of `homeId` now, whatever its trigger and conditions.
	 *
	 * @throws When the routine isn't in the home.
	 */
	runRoutine(homeId: string, id: string): void {
		const automation = this.#routine(homeId, id);
		JobDTO.enqueue(
			"automation.run",
			{ automationId: automation.id },
			{ maxAttempts: 1 },
		);
	}

	/** Removes routine `id` of `homeId`; `false` when there was none. */
	removeRoutine(homeId: string, id: string): boolean {
		const automation = AutomationDTO.find(id, homeId);
		automation?.delete();
		return automation !== undefined;
	}

	/**
	 * Saves `definition` as a new scene of `homeId`, or over scene `id`.
	 *
	 * @throws When a device in it is gone or can't take its command, or scene `id` isn't in the home.
	 */
	saveScene(
		homeId: string,
		id: string | undefined,
		definition: Pick<SceneRow, "name" | "members">,
	): SceneDTO {
		const catalog = plugins.catalog();
		const broken = definition.members.some((member) => {
			const device = DeviceDTO.find(member.deviceId, homeId);
			return (
				!device || kindInfo(catalog, device.kind).card !== member.command.type
			);
		});
		if (broken) {
			throw new Error("A device in the scene is gone, or can't take that.");
		}
		if (!id) {
			return SceneDTO.create(homeId, definition);
		}
		const existing = SceneDTO.find(id, homeId);
		if (!existing) {
			throw new Error("That scene is gone.");
		}
		existing.update(definition);
		return existing;
	}

	/** Removes scene `id` of `homeId`; `false` when there was none. */
	removeScene(homeId: string, id: string): boolean {
		const scene = SceneDTO.find(id, homeId);
		scene?.delete();
		return scene !== undefined;
	}

	/** Every device `definition` watches, checks or drives. */
	devicesOf(definition: AutomationDefinition): string[] {
		const { trigger, conditions, actions } = definition;
		return [
			...(trigger.type === "contact" ? trigger.deviceIds : []),
			...(trigger.type === "device" ? [trigger.test.deviceId] : []),
			...conditions.flatMap((condition) =>
				condition.type === "device" ? [condition.test.deviceId] : [],
			),
			...actions.flatMap((action) =>
				action.type === "device"
					? [action.deviceId]
					: action.type === "valves" || action.type === "heating"
						? action.deviceIds
						: [],
			),
		];
	}

	#routine(homeId: string, id: string): AutomationDTO {
		const automation = AutomationDTO.find(id, homeId);
		if (!automation) {
			throw new Error("That routine is gone.");
		}
		return automation;
	}

	#brokenReference(
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
				if (
					action.sceneIds.some((sceneId) => !SceneDTO.find(sceneId, homeId))
				) {
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
}

export const library = new AutomationLibrary();
