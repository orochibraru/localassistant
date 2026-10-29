import type {
	ButtonState,
	DeviceState,
	FanState,
	LightFeature,
	LightState,
	LockState,
	SensorState,
} from "#lib/devices.js";
import type { DeviceCommand, PluginContext } from "#lib/plugin-sdk.js";

import type { DiscoveryConfig, Role } from "./discovery.js";

type Publish = PluginContext["mqtt"]["publish"];

const colorModes = new Set(["hs", "xy", "rgb", "rgbw", "rgbww"]);

/** Lights, locks, fans, sensors and buttons announced for Home Assistant: their states and the payloads they take. */
class Controls {
	/** The state a newly announced device of `kind` starts in, or `null` for a kind this doesn't handle. */
	initial(kind: string, config: DiscoveryConfig): DeviceState | null {
		if (kind === "mqtt-discovery-light") {
			const mireds = (key: string, fallback: number) =>
				typeof config[key] === "number" ? (config[key] as number) : fallback;
			return {
				type: "light",
				on: null,
				brightness: null,
				temperature: null,
				minTemperature: Math.round(1_000_000 / mireds("max_mireds", 500)),
				maxTemperature: Math.round(1_000_000 / mireds("min_mireds", 153)),
				color: null,
				features: this.lightFeatures(config),
			};
		}
		if (kind === "mqtt-discovery-lock") {
			return { type: "lock", locked: null, jammed: false, battery: null };
		}
		if (kind === "mqtt-discovery-fan") {
			const [low, high] = this.#speedRange(config);
			return {
				type: "fan",
				on: null,
				speed: null,
				speedSteps:
					typeof config.percentage_command_topic === "string"
						? high - low + 1
						: 0,
				oscillating: null,
			};
		}
		if (kind === "mqtt-discovery-sensor") {
			return { type: "sensor", readings: [] };
		}
		return kind === "mqtt-discovery-button"
			? { type: "button", pressedAt: null }
			: null;
	}

	/** What a light's config says it can do beyond on and off. */
	lightFeatures(config: DiscoveryConfig): LightFeature[] {
		const modes = Array.isArray(config.supported_color_modes)
			? config.supported_color_modes.map(String)
			: [];
		const json = config.schema === "json";
		const features: LightFeature[] = [];
		if (
			(json &&
				(config.brightness === true ||
					modes.some((mode) => mode !== "onoff"))) ||
			typeof config.brightness_command_topic === "string"
		) {
			features.push("brightness");
		}
		if (
			(json && modes.includes("color_temp")) ||
			typeof config.color_temp_command_topic === "string"
		) {
			features.push("temperature");
		}
		if (
			(json && modes.some((mode) => colorModes.has(mode))) ||
			typeof config.hs_command_topic === "string"
		) {
			features.push("color");
		}
		return features;
	}

	/** `previous` with the part `role` carries set from `value`; `previous` as it is when the role isn't its own. */
	apply(
		previous: DeviceState,
		role: Role,
		value: unknown,
		config: DiscoveryConfig,
	): DeviceState {
		const text = String(value);
		const option = (key: string, fallback: string) =>
			typeof config[key] === "string" ? (config[key] as string) : fallback;
		if (previous.type === "light") {
			return this.#light(previous, role, text, config);
		}
		if (previous.type === "lock" && role === "lock") {
			if (text === option("state_jammed", "JAMMED")) {
				return { ...previous, jammed: true };
			}
			const locked =
				text === option("state_locked", "LOCKED")
					? true
					: text === option("state_unlocked", "UNLOCKED")
						? false
						: previous.locked;
			return { ...previous, locked, jammed: false };
		}
		if (previous.type === "fan") {
			return this.#fan(previous, role, text, config);
		}
		if (previous.type === "sensor" && role === "reading") {
			return { ...previous, readings: [this.#reading(text, config)] };
		}
		return previous;
	}

	/**
	 * Publishes what a light, lock, fan or button command asks for and returns the state the device should now be in, or
	 * `null` when the device isn't one of those.
	 *
	 * @throws When the broker can't be reached.
	 */
	async command(
		state: DeviceState,
		command: DeviceCommand,
		config: DiscoveryConfig,
		publish: Publish,
	): Promise<DeviceState | null> {
		const option = (key: string, fallback: string) =>
			typeof config[key] === "string" ? (config[key] as string) : fallback;
		const commandTopic = option("command_topic", "");
		if (command.type === "light" && state.type === "light") {
			return this.#switchLight(state, command.change, config, publish);
		}
		if (command.type === "lock" && state.type === "lock") {
			await publish(
				commandTopic,
				command.locked
					? option("payload_lock", "LOCK")
					: option("payload_unlock", "UNLOCK"),
			);
			return { ...state, locked: command.locked, jammed: false };
		}
		if (command.type === "fan" && state.type === "fan") {
			return this.#turnFan(state, command.change, config, publish);
		}
		if (command.type === "button" && state.type === "button") {
			await publish(commandTopic, option("payload_press", "PRESS"));
			return {
				...state,
				pressedAt: new Date().toISOString(),
			} satisfies ButtonState;
		}
		return null;
	}

	#light(
		previous: LightState,
		role: Role,
		text: string,
		config: DiscoveryConfig,
	): LightState {
		const scale =
			typeof config.brightness_scale === "number"
				? config.brightness_scale
				: 255;
		const number = Number.parseFloat(text);
		const known = Number.isFinite(number) ? number : null;
		if (role === "light" && config.schema === "json") {
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(text) as Record<string, unknown>;
			} catch {
				return previous;
			}
			const color = parsed.color as { h?: unknown; s?: unknown } | undefined;
			return {
				...previous,
				on:
					parsed.state === "ON"
						? true
						: parsed.state === "OFF"
							? false
							: previous.on,
				brightness:
					typeof parsed.brightness === "number"
						? Math.round((parsed.brightness / scale) * 100)
						: previous.brightness,
				temperature:
					typeof parsed.color_temp === "number" && parsed.color_temp > 0
						? Math.round(1_000_000 / parsed.color_temp)
						: previous.temperature,
				color:
					typeof color?.h === "number" && typeof color.s === "number"
						? { hue: color.h, saturation: color.s }
						: previous.color,
			};
		}
		if (role === "light") {
			const on =
				typeof config.payload_on === "string" ? config.payload_on : "ON";
			const off =
				typeof config.payload_off === "string" ? config.payload_off : "OFF";
			return {
				...previous,
				on: text === on ? true : text === off ? false : previous.on,
			};
		}
		if (role === "light-brightness" && known !== null) {
			return { ...previous, brightness: Math.round((known / scale) * 100) };
		}
		if (role === "light-temperature" && known !== null && known > 0) {
			return { ...previous, temperature: Math.round(1_000_000 / known) };
		}
		if (role === "light-color") {
			const [hue, saturation] = text.split(",").map(Number.parseFloat);
			return hue !== undefined &&
				saturation !== undefined &&
				Number.isFinite(hue + saturation)
				? { ...previous, color: { hue, saturation } }
				: previous;
		}
		return previous;
	}

	#fan(
		previous: FanState,
		role: Role,
		text: string,
		config: DiscoveryConfig,
	): FanState {
		const on = typeof config.payload_on === "string" ? config.payload_on : "ON";
		const off =
			typeof config.payload_off === "string" ? config.payload_off : "OFF";
		if (role === "fan") {
			return {
				...previous,
				on: text === on ? true : text === off ? false : previous.on,
			};
		}
		if (role === "fan-speed") {
			const [low, high] = this.#speedRange(config);
			const value = Number.parseFloat(text);
			return Number.isFinite(value)
				? {
						...previous,
						speed:
							value <= 0
								? 0
								: Math.round(
										((Math.min(value, high) - low + 1) / (high - low + 1)) *
											100,
									),
					}
				: previous;
		}
		if (role === "fan-oscillation") {
			const oscillating =
				typeof config.payload_oscillation_on === "string"
					? config.payload_oscillation_on
					: "oscillate_on";
			return { ...previous, oscillating: text === oscillating };
		}
		return previous;
	}

	#reading(
		text: string,
		config: DiscoveryConfig,
	): SensorState["readings"][number] {
		const name =
			typeof config.device_class === "string"
				? config.device_class.replaceAll("_", " ")
				: "Value";
		const unit =
			typeof config.unit_of_measurement === "string"
				? config.unit_of_measurement
				: null;
		const on = typeof config.payload_on === "string" ? config.payload_on : "ON";
		const off =
			typeof config.payload_off === "string" ? config.payload_off : "OFF";
		if (text === on || text === off) {
			return { name, value: text === on, unit };
		}
		const number = Number.parseFloat(text);
		return {
			name,
			value:
				Number.isFinite(number) && /^-?[\d.]+$/.test(text.trim())
					? number
					: text,
			unit,
		};
	}

	async #switchLight(
		state: LightState,
		change: Extract<DeviceCommand, { type: "light" }>["change"],
		config: DiscoveryConfig,
		publish: Publish,
	): Promise<LightState> {
		const scale =
			typeof config.brightness_scale === "number"
				? config.brightness_scale
				: 255;
		const topic = (key: string) =>
			typeof config[key] === "string" ? (config[key] as string) : null;
		const on =
			change.on ??
			(change.brightness === undefined ? state.on : change.brightness > 0);
		const level =
			change.brightness === undefined
				? undefined
				: Math.round((change.brightness / 100) * scale);
		const mireds =
			change.temperature === undefined
				? undefined
				: Math.round(1_000_000 / change.temperature);
		if (config.schema === "json") {
			await publish(topic("command_topic") ?? "", {
				state: on === false ? "OFF" : "ON",
				...(level === undefined || on === false ? {} : { brightness: level }),
				...(mireds === undefined ? {} : { color_temp: mireds }),
				...(change.color
					? { color: { h: change.color.hue, s: change.color.saturation } }
					: {}),
			});
		} else {
			if (change.on !== undefined || on === false) {
				await publish(
					topic("command_topic") ?? "",
					on === false
						? (topic("payload_off") ?? "OFF")
						: (topic("payload_on") ?? "ON"),
				);
			}
			const brightnessTopic = topic("brightness_command_topic");
			if (level !== undefined && on !== false && brightnessTopic) {
				await publish(brightnessTopic, String(level));
			}
			const temperatureTopic = topic("color_temp_command_topic");
			if (mireds !== undefined && temperatureTopic) {
				await publish(temperatureTopic, String(mireds));
			}
			const colorTopic = topic("hs_command_topic");
			if (change.color && colorTopic) {
				await publish(
					colorTopic,
					`${change.color.hue},${change.color.saturation}`,
				);
			}
		}
		return {
			...state,
			on,
			brightness: change.brightness ?? state.brightness,
			temperature: change.temperature ?? state.temperature,
			color: change.color ?? state.color,
		};
	}

	async #turnFan(
		state: FanState,
		change: Extract<DeviceCommand, { type: "fan" }>["change"],
		config: DiscoveryConfig,
		publish: Publish,
	): Promise<FanState> {
		const option = (key: string, fallback: string) =>
			typeof config[key] === "string" ? (config[key] as string) : fallback;
		if (change.on !== undefined) {
			await publish(
				option("command_topic", ""),
				change.on ? option("payload_on", "ON") : option("payload_off", "OFF"),
			);
		}
		const speedTopic =
			typeof config.percentage_command_topic === "string"
				? config.percentage_command_topic
				: null;
		if (change.speed !== undefined && speedTopic) {
			const [low, high] = this.#speedRange(config);
			const value =
				change.speed <= 0
					? 0
					: Math.max(
							low,
							Math.round(low - 1 + (change.speed / 100) * (high - low + 1)),
						);
			await publish(speedTopic, String(value));
		}
		const oscillationTopic =
			typeof config.oscillation_command_topic === "string"
				? config.oscillation_command_topic
				: null;
		if (change.oscillating !== undefined && oscillationTopic) {
			await publish(
				oscillationTopic,
				change.oscillating
					? option("payload_oscillation_on", "oscillate_on")
					: option("payload_oscillation_off", "oscillate_off"),
			);
		}
		return {
			...state,
			on:
				change.on ?? (change.speed === undefined ? state.on : change.speed > 0),
			speed: change.speed ?? state.speed,
			oscillating: change.oscillating ?? state.oscillating,
		};
	}

	#speedRange(config: DiscoveryConfig): [number, number] {
		const low =
			typeof config.speed_range_min === "number" ? config.speed_range_min : 1;
		const high =
			typeof config.speed_range_max === "number" ? config.speed_range_max : 100;
		return [low, Math.max(low, high)];
	}
}

export const controls = new Controls();
