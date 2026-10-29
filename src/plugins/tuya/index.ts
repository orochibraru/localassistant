import TuyaDevice from "tuyapi";

import type { CoverState } from "#lib/devices.js";
import {
	definePlugin,
	type DeviceCommand,
	type FoundDevice,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

const settleMs = 30_000;

/** Tuya covers (blinds, curtains, shutters) straight over the LAN with their local key, no cloud. */
class Tuya implements Plugin {
	/** The blind the form describes: its device ID and address. */
	add(values: PluginValues): FoundDevice {
		return {
			kind: "tuya-cover",
			externalId: String(values.deviceId),
			host: String(values.host),
		};
	}

	/**
	 * Reads a cover's position.
	 *
	 * @throws When the cover can't be reached or rejects the local key.
	 */
	read(device: PluginDevice, context: PluginContext): Promise<CoverState> {
		return this.#withConnection(device, context, async (connection) => {
			const reply = await connection.get({ schema: true });
			const dps = typeof reply === "object" && "dps" in reply ? reply.dps : {};
			return this.state(device, dps);
		});
	}

	/**
	 * Opens, closes, stops or moves a cover, then has the worker read where it ended up once it stopped moving.
	 *
	 * @throws When the cover can't be reached or rejects the command.
	 */
	async command(
		device: PluginDevice,
		command: DeviceCommand,
		context: PluginContext,
	): Promise<void> {
		if (command.type !== "cover") {
			throw new Error("A blind only opens, closes and moves.");
		}
		const move = command.move;
		await this.#withConnection(device, context, async (connection) => {
			await connection.set(
				"action" in move
					? { dps: this.#number(device, "controlDp", 1), set: move.action }
					: {
							dps: this.#number(device, "positionDp", 2),
							set: device.fields.inverted ? 100 - move.position : move.position,
						},
			);
		});
		context.refreshLater(device, settleMs);
	}

	/** The cover's position from its data points, 0 closed and 100 open. */
	state(device: PluginDevice, dps: Record<string, unknown>): CoverState {
		const raw =
			dps[String(this.#number(device, "positionStateDp", 3))] ??
			dps[String(this.#number(device, "positionDp", 2))];
		if (typeof raw !== "number") {
			return { type: "cover", position: null };
		}
		return {
			type: "cover",
			position: device.fields.inverted ? 100 - raw : raw,
		};
	}

	#number(device: PluginDevice, name: string, fallback: number): number {
		const value = device.fields[name];
		return typeof value === "number" ? value : fallback;
	}

	async #withConnection<Result>(
		device: PluginDevice,
		context: PluginContext,
		work: (connection: TuyaDevice) => Promise<Result>,
	): Promise<Result> {
		const key = device.secret("localKey");
		if (!device.host || !key) {
			throw new Error("This cover has no address or local key.");
		}
		const connection = new TuyaDevice({
			id: device.externalId,
			key,
			ip: device.host,
			version: String(device.fields.protocolVersion ?? "3.3"),
			issueGetOnConnect: false,
		});
		connection.on("error", (error) => {
			context.logger.debug("Connection error", { device: device.id }, error);
		});
		try {
			await connection.connect();
			return await work(connection);
		} finally {
			connection.disconnect();
		}
	}
}

export default definePlugin(new Tuya());
