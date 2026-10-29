import type { ContactState, DeviceState } from "#lib/devices.js";
import type { DeviceDTO } from "#lib/dto/device.js";
import { Logger } from "#lib/server/core/logger.js";

const logger = new Logger("Devices");

export type ContactListener = (
	device: DeviceDTO,
	next: ContactState,
) => void | Promise<void>;

export type ChangeListener = (
	device: DeviceDTO,
	previous: DeviceState | null,
	next: DeviceState,
) => void | Promise<void>;

/** Saves what devices report and tells whoever listens when a device changes, or a door or window opens or shuts. */
class DeviceEvents {
	#contactListeners: ContactListener[] = [];
	#changeListeners: ChangeListener[] = [];

	/** Calls `listener` whenever a door or window sensor opens or shuts. */
	onContact(listener: ContactListener): void {
		this.#contactListeners.push(listener);
	}

	/** Calls `listener` whenever a device reports a state that differs from the one it had. */
	onChange(listener: ChangeListener): void {
		this.#changeListeners.push(listener);
	}

	/**
	 * Records `state` for `device`, then calls the change listeners when it differs and the contact listeners when a door
	 * or window opened or shut; a failing listener is logged.
	 */
	save(device: DeviceDTO, state: DeviceState): void {
		const previous = device.state;
		device.saveState(state);
		if (JSON.stringify(previous) !== JSON.stringify(state)) {
			for (const listener of this.#changeListeners) {
				void Promise.resolve()
					.then(() => listener(device, previous, state))
					.catch((error: unknown) =>
						logger.warn("Change listener failed", { device: device.id }, error),
					);
			}
		}
		if (
			state.type !== "contact" ||
			previous?.type !== "contact" ||
			previous.open === state.open
		) {
			return;
		}
		for (const listener of this.#contactListeners) {
			void Promise.resolve()
				.then(() => listener(device, state))
				.catch((error: unknown) =>
					logger.warn("Contact listener failed", { device: device.id }, error),
				);
		}
	}
}

export const deviceEvents = new DeviceEvents();
