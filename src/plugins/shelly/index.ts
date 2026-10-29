import {
	definePlugin,
	type Plugin,
	type PluginContext,
} from "#lib/plugin-sdk.js";

import { shelly } from "./readings.js";

const saveEveryMs = 5000;

/**
 * Shelly Gen2 and later devices on the shared MQTT broker: each `<prefix>/status/<component>` message becomes a meter
 * per channel, added the first time it reports and saved every five seconds.
 */
class Shelly implements Plugin {
	#pending = new Map<string, { power?: number; energy?: number }>();

	/** Listens to every Shelly status topic and saves what's waiting every five seconds. */
	start(context: PluginContext): void {
		this.#pending.clear();
		context.mqtt.subscribe("+/status/+", (topic, payload) =>
			this.handle(context, topic, payload),
		);
		context.every(saveEveryMs, () => this.flush(context));
	}

	/** Saves every reading waiting to be written, over the meter's latest state. */
	flush(context: PluginContext): void {
		for (const [deviceId, reading] of this.#pending) {
			const device = context.device(deviceId);
			if (device?.state?.type === "meter") {
				context.saveState(device, { ...device.state, ...reading });
			}
		}
		this.#pending.clear();
	}

	/** Handles one status message: adds the meters it names that aren't known yet and keeps their readings. */
	handle(context: PluginContext, topic: string, payload: Buffer): void {
		const [prefix, , component] = topic.split("/");
		let body: unknown;
		try {
			body = JSON.parse(String(payload));
		} catch {
			return;
		}
		if (!prefix || !component || !body || typeof body !== "object") {
			return;
		}
		for (const reading of shelly.readings(
			component,
			body as Record<string, unknown>,
		)) {
			const externalId = `${prefix}/${reading.channel}`;
			let device = context
				.devices()
				.find((entry) => entry.externalId === externalId);
			if (!device) {
				context.found([
					{
						kind: "shelly-meter",
						externalId,
						name: `${prefix} ${reading.channel}`,
						host: prefix,
						state: { type: "meter", power: null, energy: null },
					},
				]);
				device = context
					.devices()
					.find((entry) => entry.externalId === externalId);
			}
			if (!device) {
				continue;
			}
			this.#pending.set(device.id, {
				...this.#pending.get(device.id),
				...(reading.power === undefined ? {} : { power: reading.power }),
				...(reading.energy === undefined ? {} : { energy: reading.energy }),
			});
		}
	}
}

export default definePlugin(new Shelly());
