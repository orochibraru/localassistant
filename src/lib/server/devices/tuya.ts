import TuyaDevice from "tuyapi";

import type { CoverAction, CoverState } from "#lib/devices.js";
import type { DeviceDTO } from "#lib/dto/device.js";
import { Logger } from "#lib/server/core/logger.js";
import { secrets } from "#lib/server/core/secrets.js";

const logger = new Logger("Tuya");

/** Talks to Tuya covers (blinds, curtains, shutters) straight over the LAN with their local key, no cloud. */
class TuyaCovers {
	/**
	 * Reads a cover's position.
	 *
	 * @throws When the cover can't be reached or rejects the local key.
	 */
	read(device: DeviceDTO): Promise<CoverState> {
		return this.#withConnection(device, async (connection) => {
			const reply = await connection.get({ schema: true });
			const dps = typeof reply === "object" && "dps" in reply ? reply.dps : {};
			return this.#state(device, dps);
		});
	}

	/**
	 * Opens, closes or stops a cover.
	 *
	 * @throws When the cover can't be reached or rejects the command.
	 */
	act(device: DeviceDTO, action: CoverAction): Promise<void> {
		return this.#withConnection(device, async (connection) => {
			await connection.set({ dps: device.controlDp, set: action });
		});
	}

	/**
	 * Moves a cover to `position`, 0 closed and 100 fully open.
	 *
	 * @throws When the cover can't be reached or rejects the command.
	 */
	moveTo(device: DeviceDTO, position: number): Promise<void> {
		return this.#withConnection(device, async (connection) => {
			await connection.set({
				dps: device.positionDp,
				set: device.inverted ? 100 - position : position,
			});
		});
	}

	#state(device: DeviceDTO, dps: Record<string, unknown>): CoverState {
		const raw =
			dps[String(device.positionStateDp)] ?? dps[String(device.positionDp)];
		if (typeof raw !== "number") {
			return { type: "cover", position: null };
		}
		return { type: "cover", position: device.inverted ? 100 - raw : raw };
	}

	async #withConnection<Result>(
		device: DeviceDTO,
		work: (connection: TuyaDevice) => Promise<Result>,
	): Promise<Result> {
		const encryptedKey = device.encryptedLocalKey();
		if (!device.host || !encryptedKey) {
			throw new Error("This cover has no address or local key.");
		}
		const connection = new TuyaDevice({
			id: device.externalId,
			key: secrets.decrypt(encryptedKey),
			ip: device.host,
			version: device.protocolVersion ?? "3.3",
			issueGetOnConnect: false,
		});
		connection.on("error", (error) => {
			logger.debug("Connection error", { device: device.id }, error);
		});
		try {
			await connection.connect();
			return await work(connection);
		} finally {
			connection.disconnect();
		}
	}
}

export const tuyaCovers = new TuyaCovers();
