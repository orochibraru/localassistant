import type { PresetKey } from "#lib/automations.js";
import type { DeviceState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { Logger } from "#lib/server/core/logger.js";
import { broker } from "#lib/server/devices/broker.js";

const logger = new Logger("Presets");

/** Ready-made automations a home switches on, run by the worker as the devices report. */
class Presets {
	/** The presets switched on in `homeId`. */
	enabled(homeId: string): PresetKey[] {
		return getSetting("presets")[homeId] ?? [];
	}

	/** Switches a preset on or off in `homeId`. */
	set(homeId: string, key: PresetKey, on: boolean): void {
		const all = getSetting("presets");
		const current = new Set(all[homeId] ?? []);
		if (on) {
			current.add(key);
		} else {
			current.delete(key);
		}
		setSetting("presets", { ...all, [homeId]: [...current] });
	}

	/**
	 * Reacts to a door or window sensor opening or shutting: its room's valves close while it's open and go back to their
	 * target once every sensor in the room is shut. Never throws.
	 */
	async onContact(sensor: DeviceDTO, next: DeviceState): Promise<void> {
		const { homeId, roomId, name } = sensor.toJSON();
		if (
			next.type !== "contact" ||
			next.open === null ||
			!homeId ||
			!roomId ||
			!this.enabled(homeId).includes("window-valves")
		) {
			return;
		}
		const room = DeviceDTO.inRoom(homeId, roomId);
		const anyOpen = room.some(
			(device) => device.state?.type === "contact" && device.state.open,
		);
		for (const valve of room) {
			const state = valve.state;
			if (state?.type !== "valve") {
				continue;
			}
			try {
				if (next.open && !state.heldBy) {
					await broker.publish(valve, { [state.setpoint]: state.min });
					valve.saveState({
						...state,
						heldBy: name,
						heldTarget: state.target,
						target: state.min,
					});
				} else if (!anyOpen && state.heldBy) {
					const target = state.heldTarget ?? state.target ?? state.min;
					await broker.publish(valve, { [state.setpoint]: target });
					valve.saveState({ ...state, heldBy: null, heldTarget: null, target });
				}
			} catch (error) {
				logger.warn("Valve didn't take the preset", { valve: valve.id }, error);
			}
		}
	}
}

export const presets = new Presets();
