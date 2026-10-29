import type { ContactState, DeviceState } from "#lib/devices.js";
import type { DeviceDTO } from "#lib/dto/device.js";
import { Logger } from "#lib/server/core/logger.js";

const logger = new Logger("Devices");

export type ContactListener = (
	device: DeviceDTO,
	next: ContactState,
) => void | Promise<void>;

/** Saves what devices report and tells whoever listens when a door or window opens or shuts. */
class DeviceEvents {
	#contactListeners: ContactListener[] = [];

	/** Calls `listener` whenever a door or window sensor opens or shuts. */
	onContact(listener: ContactListener): void {
		this.#contactListeners.push(listener);
	}

	/** Records `state` for `device`, then calls the contact listeners when it opened or shut; a failing listener is logged. */
	save(device: DeviceDTO, state: DeviceState): void {
		const previous = device.state;
		device.saveState(state);
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
