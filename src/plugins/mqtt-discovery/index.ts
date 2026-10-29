import type {
	ClimateMode,
	ClimateState,
	CoverState,
	DeviceState,
} from "#lib/devices.js";
import {
	definePlugin,
	type DeviceCommand,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";

import {
	discovery,
	type DiscoveryConfig,
	type Role,
	type Subscription,
} from "./discovery.js";

const saveEveryMs = 5000;

interface Listener {
	deviceId: string;
	role: Role;
	template: string | null;
}

/**
 * Devices that announce themselves the way Home Assistant expects, without Home Assistant: Tasmota, ESPHome,
 * Zigbee2MQTT, Shelly and others publish a config under `homeassistant/`; each becomes a device whose state follows
 * its topics and whose controls publish on its command topics.
 */
class MqttDiscovery implements Plugin {
	#listeners = new Map<string, Listener[]>();
	#pending = new Map<string, DeviceState>();

	/**
	 * Checks the broker is connected before the prefix is saved.
	 *
	 * @throws When no MQTT broker is connected.
	 */
	connect(_values: unknown, context: PluginContext): Promise<void> {
		if (!context.mqtt.configured()) {
			return Promise.reject(new Error("Connect the MQTT broker first."));
		}
		return Promise.resolve();
	}

	/** Listens for discovery messages and for the state of every device already known, saving readings every five seconds. */
	start(context: PluginContext): void {
		const prefix = context.settings()?.prefix;
		if (typeof prefix !== "string") {
			return;
		}
		this.#listeners.clear();
		this.#pending.clear();
		for (const filter of [`${prefix}/+/+/config`, `${prefix}/+/+/+/config`]) {
			context.mqtt.subscribe(filter, (topic, payload) =>
				this.announce(context, prefix, topic, payload),
			);
		}
		for (const device of context.devices()) {
			this.#follow(context, device.id, device.kind, this.#config(device));
		}
		context.every(saveEveryMs, () => this.flush(context));
	}

	/** Adds or updates the device a discovery message announces and follows its state topics. */
	announce(
		context: PluginContext,
		prefix: string,
		topic: string,
		payload: Buffer,
	): void {
		const [component = "", ...rest] = topic.slice(prefix.length + 1).split("/");
		const objectPath = rest.slice(0, -1).join("/");
		let raw: unknown;
		try {
			raw = JSON.parse(String(payload));
		} catch {
			return;
		}
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			return;
		}
		const entity = discovery.entity(
			component,
			objectPath,
			raw as DiscoveryConfig,
		);
		if (!entity) {
			return;
		}
		context.found([
			{
				kind: entity.kind,
				externalId: entity.externalId,
				name: entity.name,
				fields: { config: JSON.stringify(entity.config) },
				state: this.#initial(entity.kind, entity.config),
			},
		]);
		const device = context
			.devices()
			.find(
				(entry) =>
					entry.kind === entity.kind && entry.externalId === entity.externalId,
			);
		if (device) {
			this.#follow(context, device.id, entity.kind, entity.config);
		}
	}

	/** Applies one state message to every device listening on its topic; a door or window is saved at once. */
	receive(context: PluginContext, topic: string, payload: Buffer): void {
		for (const listener of this.#listeners.get(topic) ?? []) {
			const device = context.device(listener.deviceId);
			const previous = this.#pending.get(listener.deviceId) ?? device?.state;
			if (!device || !previous) {
				continue;
			}
			const value = discovery.render(listener.template, String(payload));
			if (value === undefined || value === null) {
				continue;
			}
			const next = this.apply(
				previous,
				listener.role,
				value,
				this.#config(device),
			);
			if (next.type === "contact") {
				this.#pending.delete(device.id);
				context.saveState(device, next);
			} else {
				this.#pending.set(device.id, next);
			}
		}
	}

	/** Saves every reading waiting to be written. */
	flush(context: PluginContext): void {
		for (const [deviceId, state] of this.#pending) {
			const device = context.device(deviceId);
			if (device) {
				context.saveState(device, state);
			}
		}
		this.#pending.clear();
	}

	/** `previous` with the part `role` carries set from `value`, read the way the device's config says. */
	apply(
		previous: DeviceState,
		role: Role,
		value: unknown,
		config: DiscoveryConfig,
	): DeviceState {
		const text = String(value);
		const number = Number.parseFloat(text);
		const known = Number.isFinite(number) ? number : null;
		const option = (key: string, fallback: string) =>
			typeof config[key] === "string" ? (config[key] as string) : fallback;
		if (previous.type === "switch" && role === "switch") {
			const on = option("state_on", option("payload_on", "ON"));
			const off = option("state_off", option("payload_off", "OFF"));
			return {
				...previous,
				on: text === on ? true : text === off ? false : previous.on,
			};
		}
		if (previous.type === "contact" && role === "contact") {
			return { ...previous, open: text === option("payload_on", "ON") };
		}
		if (previous.type === "meter" && role === "power" && known !== null) {
			const unit = option("unit_of_measurement", "W");
			return { ...previous, power: unit === "kW" ? known * 1000 : known };
		}
		if (previous.type === "meter" && role === "energy" && known !== null) {
			const unit = option("unit_of_measurement", "kWh");
			return { ...previous, energy: unit === "Wh" ? known / 1000 : known };
		}
		if (previous.type === "cover") {
			return this.#cover(previous, role, text, known, config);
		}
		if (previous.type === "climate") {
			return this.#climate(previous, role, text, known);
		}
		return previous;
	}

	/**
	 * Publishes a command on the device's command topics and returns the state it should now be in.
	 *
	 * @throws When the device can't take that command or the broker can't be reached.
	 */
	async command(
		device: PluginDevice,
		command: DeviceCommand,
		context: PluginContext,
	): Promise<DeviceState> {
		const config = this.#config(device);
		const state = device.state;
		const option = (key: string, fallback: string) =>
			typeof config[key] === "string" ? (config[key] as string) : fallback;
		if (command.type === "switch" && state?.type === "switch") {
			const payload = command.on
				? option("payload_on", "ON")
				: option("payload_off", "OFF");
			await context.mqtt.publish(
				option("command_topic", ""),
				config.schema === "json"
					? { state: command.on ? "ON" : "OFF" }
					: payload,
			);
			return { ...state, on: command.on };
		}
		if (command.type === "cover" && state?.type === "cover") {
			return this.#move(context, config, state, command.move);
		}
		if (command.type === "climate" && state?.type === "climate") {
			return this.#adjust(context, config, state, command.change);
		}
		throw new Error("That device doesn't take that command.");
	}

	#config(device: PluginDevice): DiscoveryConfig {
		try {
			return JSON.parse(
				String(device.fields.config ?? "{}"),
			) as DiscoveryConfig;
		} catch {
			return {};
		}
	}

	#follow(
		context: PluginContext,
		deviceId: string,
		kind: string,
		config: DiscoveryConfig,
	): void {
		for (const subscription of discovery.subscriptions(kind, config)) {
			this.#listen(context, deviceId, subscription);
		}
	}

	#listen(
		context: PluginContext,
		deviceId: string,
		subscription: Subscription,
	): void {
		const listeners = this.#listeners.get(subscription.topic);
		const listener = {
			deviceId,
			role: subscription.role,
			template: subscription.template,
		};
		if (listeners) {
			if (
				!listeners.some(
					(entry) =>
						entry.deviceId === deviceId && entry.role === subscription.role,
				)
			) {
				listeners.push(listener);
			}
			return;
		}
		this.#listeners.set(subscription.topic, [listener]);
		context.mqtt.subscribe(subscription.topic, (topic, payload) =>
			this.receive(context, topic, payload),
		);
	}

	#initial(kind: string, config: DiscoveryConfig): DeviceState {
		if (kind === "mqtt-discovery-cover") {
			return { type: "cover", position: null };
		}
		if (kind === "mqtt-discovery-contact") {
			return { type: "contact", open: null, battery: null };
		}
		if (kind === "mqtt-discovery-climate") {
			const number = (key: string, fallback: number) =>
				typeof config[key] === "number" ? (config[key] as number) : fallback;
			const modes = Array.isArray(config.modes)
				? config.modes.filter(
						(mode): mode is string => typeof mode === "string",
					)
				: ["off", "heat"];
			return {
				type: "climate",
				power: false,
				mode: null,
				modes: [
					...new Set(
						modes
							.map((mode) => discovery.climateMode(mode))
							.filter((mode): mode is ClimateMode => mode !== null),
					),
				],
				targetTemperature: null,
				roomTemperature: null,
				minTemperature: number("min_temp", 7),
				maxTemperature: number("max_temp", 35),
				offline: false,
			};
		}
		return kind === "mqtt-discovery-switch"
			? { type: "switch", on: null, power: null, energy: null }
			: { type: "meter", power: null, energy: null };
	}

	#cover(
		previous: CoverState,
		role: Role,
		text: string,
		known: number | null,
		config: DiscoveryConfig,
	): CoverState {
		const open =
			typeof config.position_open === "number" ? config.position_open : 100;
		const closed =
			typeof config.position_closed === "number" ? config.position_closed : 0;
		if (role === "cover-position" && known !== null && open !== closed) {
			const position = ((known - closed) / (open - closed)) * 100;
			return {
				...previous,
				position: Math.round(Math.min(100, Math.max(0, position))),
			};
		}
		if (role === "cover-state" && !config.position_topic) {
			const opened =
				typeof config.state_open === "string" ? config.state_open : "open";
			const shut =
				typeof config.state_closed === "string"
					? config.state_closed
					: "closed";
			return text === opened
				? { ...previous, position: 100 }
				: text === shut
					? { ...previous, position: 0 }
					: previous;
		}
		return previous;
	}

	#climate(
		previous: ClimateState,
		role: Role,
		text: string,
		known: number | null,
	): ClimateState {
		if (role === "climate-mode") {
			return {
				...previous,
				power: text !== "off",
				mode: discovery.climateMode(text) ?? previous.mode,
			};
		}
		if (role === "climate-target" && known !== null) {
			return { ...previous, targetTemperature: known };
		}
		if (role === "climate-current" && known !== null) {
			return { ...previous, roomTemperature: known };
		}
		return previous;
	}

	async #move(
		context: PluginContext,
		config: DiscoveryConfig,
		state: CoverState,
		move: Extract<DeviceCommand, { type: "cover" }>["move"],
	): Promise<CoverState> {
		const option = (key: string, fallback: string) =>
			typeof config[key] === "string" ? (config[key] as string) : fallback;
		if ("position" in move && typeof config.set_position_topic === "string") {
			const open =
				typeof config.position_open === "number" ? config.position_open : 100;
			const closed =
				typeof config.position_closed === "number" ? config.position_closed : 0;
			await context.mqtt.publish(
				config.set_position_topic,
				String(Math.round(closed + ((open - closed) * move.position) / 100)),
			);
			return { ...state, position: move.position };
		}
		const action =
			"action" in move ? move.action : move.position >= 50 ? "open" : "close";
		const payloads = {
			open: option("payload_open", "OPEN"),
			close: option("payload_close", "CLOSE"),
			stop: option("payload_stop", "STOP"),
		};
		await context.mqtt.publish(option("command_topic", ""), payloads[action]);
		return state;
	}

	async #adjust(
		context: PluginContext,
		config: DiscoveryConfig,
		state: ClimateState,
		change: Extract<DeviceCommand, { type: "climate" }>["change"],
	): Promise<ClimateState> {
		const modes = Array.isArray(config.modes)
			? config.modes.filter((mode): mode is string => typeof mode === "string")
			: [];
		let next = state;
		if (change.power !== undefined || change.mode !== undefined) {
			const power = change.power ?? state.power;
			const mode = change.mode ?? state.mode ?? "heat";
			const wanted = power ? discovery.haMode(mode, modes) : "off";
			if (typeof config.mode_command_topic !== "string") {
				throw new Error("This thermostat takes no mode.");
			}
			await context.mqtt.publish(config.mode_command_topic, wanted);
			next = { ...next, power, mode: power ? mode : next.mode };
		}
		if (change.targetTemperature !== undefined) {
			if (typeof config.temperature_command_topic !== "string") {
				throw new Error("This thermostat takes no target temperature.");
			}
			await context.mqtt.publish(
				config.temperature_command_topic,
				String(change.targetTemperature),
			);
			next = { ...next, targetTemperature: change.targetTemperature };
		}
		return next;
	}
}

export default definePlugin(new MqttDiscovery());
