import type { DeviceState } from "#lib/devices.js";
import {
	definePlugin,
	type DeviceCommand,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";

import { type BridgeDevice, zigbee } from "./mapping.js";

const saveEveryMs = 5000;
const ignoredSuffixes = ["/set", "/get", "/availability"];

/**
 * Zigbee2MQTT on the shared MQTT broker: imports the devices it lists and saves what they report, a door or window at
 * once and the rest every five seconds; valve and relay commands go out on the device's `set` topic.
 */
class Zigbee implements Plugin {
	#pending = new Map<string, Record<string, unknown>>();

	/**
	 * Checks the broker is connected before the topic is saved.
	 *
	 * @throws When no MQTT broker is connected.
	 */
	connect(_values: unknown, context: PluginContext): Promise<void> {
		if (!context.mqtt.configured()) {
			return Promise.reject(new Error("Connect the MQTT broker first."));
		}
		return Promise.resolve();
	}

	/** Listens to Zigbee2MQTT's topic and saves what's waiting every five seconds. */
	start(context: PluginContext): void {
		const topic = context.settings()?.topic;
		if (typeof topic !== "string") {
			return;
		}
		this.#pending.clear();
		context.mqtt.subscribe(`${topic}/#`, (received, payload) =>
			this.handle(context, topic, received, payload),
		);
		context.every(saveEveryMs, () => this.flush(context));
	}

	/** Saves every report waiting to be written, over the device's latest state. */
	flush(context: PluginContext): void {
		for (const [deviceId, payload] of this.#pending) {
			const device = context.device(deviceId);
			if (device?.state) {
				context.saveState(device, zigbee.merge(device.state, payload));
			}
		}
		this.#pending.clear();
	}

	/** Handles one message under Zigbee2MQTT's topic: the device list, or a device's state. */
	handle(
		context: PluginContext,
		topic: string,
		received: string,
		payload: Buffer,
	): void {
		const rest = received.slice(topic.length + 1);
		const body = this.#parse(payload);
		if (rest === "bridge/devices") {
			context.found(
				zigbee
					.devices(Array.isArray(body) ? (body as BridgeDevice[]) : [])
					.map((found) =>
						found.kind === "zigbee-light" &&
						context
							.devices()
							.some(
								(entry) =>
									entry.kind === "zigbee-switch" &&
									entry.externalId === found.ieeeAddress,
							)
							? {
									...found,
									kind: "zigbee-switch" as const,
									state: {
										type: "switch" as const,
										on: null,
										power: null,
										energy: null,
									},
								}
							: found,
					)
					.map((found) => ({
						kind: found.kind,
						externalId: found.ieeeAddress,
						name: found.name,
						host: found.friendlyName,
						state: found.state,
					})),
			);
			return;
		}
		if (
			rest.startsWith("bridge/") ||
			ignoredSuffixes.some((suffix) => rest.endsWith(suffix)) ||
			!body ||
			Array.isArray(body) ||
			typeof body !== "object"
		) {
			return;
		}
		const device = context.devices().find((entry) => entry.host === rest);
		if (!device?.state) {
			return;
		}
		const report = {
			...this.#pending.get(device.id),
			...(body as Record<string, unknown>),
		};
		const next = zigbee.merge(device.state, report);
		if (
			next.type === "contact" &&
			device.state.type === "contact" &&
			next.open !== device.state.open
		) {
			this.#pending.delete(device.id);
			context.saveState(device, next);
			return;
		}
		this.#pending.set(device.id, report);
	}

	/**
	 * Sets a radiator valve's target, turns a relay or light on or off, or locks a lock, and returns the state it's now in.
	 *
	 * @throws When the device can't take that command or the broker can't be reached.
	 */
	async command(
		device: PluginDevice,
		command: DeviceCommand,
		context: PluginContext,
	): Promise<DeviceState> {
		const topic = context.settings()?.topic;
		const state = device.state;
		if (typeof topic !== "string" || !device.host) {
			throw new Error("Connect Zigbee2MQTT first.");
		}
		const target = `${topic}/${device.host}/set`;
		if (command.type === "valve" && state?.type === "valve") {
			await context.mqtt.publish(target, { [state.setpoint]: command.target });
			return { ...state, target: command.target };
		}
		if (command.type === "switch" && state?.type === "switch") {
			await context.mqtt.publish(target, { state: command.on ? "ON" : "OFF" });
			return { ...state, on: command.on };
		}
		if (command.type === "lock" && state?.type === "lock") {
			await context.mqtt.publish(target, {
				state: command.locked ? "LOCK" : "UNLOCK",
			});
			return { ...state, locked: command.locked, jammed: false };
		}
		if (command.type === "light" && state?.type === "light") {
			const change = command.change;
			const on =
				change.on ??
				(change.brightness === undefined ? state.on : change.brightness > 0);
			await context.mqtt.publish(target, {
				state: on === false ? "OFF" : "ON",
				...(change.brightness === undefined || on === false
					? {}
					: { brightness: Math.round((change.brightness / 100) * 254) }),
				...(change.temperature === undefined
					? {}
					: { color_temp: Math.round(1_000_000 / change.temperature) }),
				...(change.color
					? {
							color: {
								hue: change.color.hue,
								saturation: change.color.saturation,
							},
						}
					: {}),
			});
			return {
				...state,
				on,
				brightness: change.brightness ?? state.brightness,
				temperature: change.temperature ?? state.temperature,
				color: change.color ?? state.color,
			};
		}
		throw new Error("That device doesn't take that command.");
	}

	#parse(payload: Buffer): unknown {
		try {
			return JSON.parse(String(payload));
		} catch {
			return null;
		}
	}
}

export default definePlugin(new Zigbee());
