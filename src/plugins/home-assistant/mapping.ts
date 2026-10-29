import type {
	ClimateMode,
	DeviceState,
	LightFeature,
	MediaAction,
	MediaPlayback,
} from "#lib/devices.js";
import type { DeviceCommand, FoundDevice } from "#lib/plugin-sdk.js";

import type { HaState } from "./client.js";

export interface ServiceCall {
	domain: string;
	service: string;
	data: Record<string, unknown>;
}

const contactClasses = new Set(["door", "window", "opening", "garage_door"]);
const switchDomains = new Set(["switch", "input_boolean"]);
const buttonDomains = new Set(["button", "input_button", "scene", "script"]);
const readingClasses = new Set([
	"temperature",
	"humidity",
	"illuminance",
	"carbon_dioxide",
	"pm25",
	"pm10",
	"pressure",
	"moisture",
	"motion",
	"occupancy",
	"presence",
	"smoke",
	"gas",
	"carbon_monoxide",
]);
const colorModes = new Set(["hs", "xy", "rgb", "rgbw", "rgbww"]);
const playbacks: Record<string, MediaPlayback> = {
	playing: "playing",
	paused: "paused",
	idle: "idle",
	on: "idle",
	standby: "idle",
	buffering: "playing",
};
const mediaServices: Record<MediaAction, string> = {
	play: "media_play",
	pause: "media_pause",
	next: "media_next_track",
	previous: "media_previous_track",
	stop: "media_stop",
};
const ownKinds: Record<string, string> = {
	light: "home-assistant-light",
	lock: "home-assistant-lock",
	fan: "home-assistant-fan",
	media_player: "home-assistant-media",
};

const climateModes: Record<string, ClimateMode> = {
	heat: "heat",
	cool: "cool",
	dry: "dry",
	fan_only: "fan",
	auto: "auto",
	heat_cool: "auto",
};

/** Home Assistant's entities as LocalAssistant devices and states, and LocalAssistant's commands as its service calls. */
class HaMapping {
	/** The kind an entity shows as, or `null` for one LocalAssistant has no card for. */
	kind(entity: HaState): string | null {
		const domain = entity.entity_id.split(".")[0] ?? "";
		const deviceClass = String(entity.attributes.device_class ?? "");
		const unit = String(entity.attributes.unit_of_measurement ?? "");
		if (switchDomains.has(domain)) {
			return "home-assistant-switch";
		}
		if (ownKinds[domain]) {
			return ownKinds[domain];
		}
		if (buttonDomains.has(domain)) {
			return "home-assistant-button";
		}
		if (domain === "cover" || domain === "climate" || domain === "camera") {
			return `home-assistant-${domain}`;
		}
		if (domain === "binary_sensor" && contactClasses.has(deviceClass)) {
			return "home-assistant-contact";
		}
		if (
			domain === "sensor" &&
			(deviceClass === "power" || unit === "W" || unit === "kW")
		) {
			return "home-assistant-power";
		}
		if (
			domain === "sensor" &&
			(deviceClass === "energy" || unit === "kWh" || unit === "Wh")
		) {
			return "home-assistant-energy";
		}
		const measured =
			(domain === "sensor" &&
				entity.attributes.state_class === "measurement") ||
			readingClasses.has(deviceClass);
		return (domain === "sensor" || domain === "binary_sensor") && measured
			? "home-assistant-sensor"
			: null;
	}

	/** The device an entity becomes, with its current state, or `null` when it has no card. */
	device(entity: HaState): FoundDevice | null {
		const kind = this.kind(entity);
		if (!kind) {
			return null;
		}
		const name = entity.attributes.friendly_name;
		const modes = entity.attributes.hvac_modes;
		return {
			kind,
			externalId: entity.entity_id,
			name: typeof name === "string" && name ? name : entity.entity_id,
			fields: Array.isArray(modes)
				? { hvacModes: modes.map(String).join(",") }
				: {},
			state: this.state(kind, entity),
		};
	}

	/** An entity's state on its card. */
	state(kind: string, entity: HaState): DeviceState {
		const attributes = entity.attributes;
		const missing =
			entity.state === "unavailable" || entity.state === "unknown";
		const number = (value: unknown) => {
			const parsed = Number.parseFloat(String(value));
			return Number.isFinite(parsed) ? parsed : null;
		};
		if (kind === "home-assistant-switch") {
			return {
				type: "switch",
				on: missing ? null : entity.state === "on",
				power: null,
				energy: null,
			};
		}
		if (kind === "home-assistant-contact") {
			return {
				type: "contact",
				open: missing ? null : entity.state === "on",
				battery: null,
			};
		}
		if (kind === "home-assistant-cover") {
			const position = number(attributes.current_position);
			return {
				type: "cover",
				position:
					position ??
					(entity.state === "open"
						? 100
						: entity.state === "closed"
							? 0
							: null),
			};
		}
		if (kind === "home-assistant-climate") {
			const modes = Array.isArray(attributes.hvac_modes)
				? attributes.hvac_modes.map(String)
				: [];
			return {
				type: "climate",
				power: !missing && entity.state !== "off",
				mode: climateModes[entity.state] ?? null,
				modes: [
					...new Set(
						modes.flatMap((mode) =>
							climateModes[mode] ? [climateModes[mode]] : [],
						),
					),
				],
				targetTemperature: number(attributes.temperature),
				roomTemperature: number(attributes.current_temperature),
				minTemperature: number(attributes.min_temp) ?? 7,
				maxTemperature: number(attributes.max_temp) ?? 35,
				offline: missing,
			};
		}
		const control = this.#controlState(kind, entity, missing);
		if (control) {
			return control;
		}
		if (kind === "home-assistant-camera") {
			return {
				type: "camera",
				streaming: !missing,
				recording: entity.state === "recording",
				lastRecordingAt: null,
				source: "Home Assistant",
				live: { format: "image", path: "stream" },
				snapshot: "snapshot.jpg",
			};
		}
		const value = missing ? null : number(entity.state);
		const unit = String(attributes.unit_of_measurement ?? "");
		if (kind === "home-assistant-power") {
			return {
				type: "meter",
				power: value !== null && unit === "kW" ? value * 1000 : value,
				energy: null,
			};
		}
		return {
			type: "meter",
			power: null,
			energy: value !== null && unit === "Wh" ? value / 1000 : value,
		};
	}

	/**
	 * The service calls that carry out `command` on a device of `kind`.
	 *
	 * @throws When that kind can't take that command.
	 */
	services(
		kind: string,
		command: DeviceCommand,
		hvacModes: string[],
		entityId: string,
	): ServiceCall[] {
		const control = this.#controlServices(kind, command, entityId);
		if (control) {
			return control;
		}
		if (kind === "home-assistant-switch" && command.type === "switch") {
			return [
				{
					domain: "homeassistant",
					service: command.on ? "turn_on" : "turn_off",
					data: {},
				},
			];
		}
		if (kind === "home-assistant-cover" && command.type === "cover") {
			const move = command.move;
			if ("position" in move) {
				return [
					{
						domain: "cover",
						service: "set_cover_position",
						data: { position: move.position },
					},
				];
			}
			const services = {
				open: "open_cover",
				close: "close_cover",
				stop: "stop_cover",
			};
			return [{ domain: "cover", service: services[move.action], data: {} }];
		}
		if (kind === "home-assistant-climate" && command.type === "climate") {
			const change = command.change;
			const calls: ServiceCall[] = [];
			if (change.power === false) {
				calls.push({
					domain: "climate",
					service: "set_hvac_mode",
					data: { hvac_mode: "off" },
				});
			} else if (change.mode) {
				calls.push({
					domain: "climate",
					service: "set_hvac_mode",
					data: { hvac_mode: this.#haMode(change.mode, hvacModes) },
				});
			} else if (change.power === true) {
				calls.push({ domain: "climate", service: "turn_on", data: {} });
			}
			if (change.targetTemperature !== undefined) {
				calls.push({
					domain: "climate",
					service: "set_temperature",
					data: { temperature: change.targetTemperature },
				});
			}
			return calls;
		}
		throw new Error("That device doesn't take that command.");
	}

	#controlState(
		kind: string,
		entity: HaState,
		missing: boolean,
	): DeviceState | null {
		const attributes = entity.attributes;
		const number = (value: unknown) => {
			const parsed = Number.parseFloat(String(value));
			return Number.isFinite(parsed) ? parsed : null;
		};
		const on = missing ? null : entity.state === "on";
		if (kind === "home-assistant-light") {
			const modes = Array.isArray(attributes.supported_color_modes)
				? attributes.supported_color_modes.map(String)
				: [];
			const features: LightFeature[] = [];
			if (modes.some((mode) => mode !== "onoff")) {
				features.push("brightness");
			}
			if (modes.includes("color_temp")) {
				features.push("temperature");
			}
			if (modes.some((mode) => colorModes.has(mode))) {
				features.push("color");
			}
			const brightness = number(attributes.brightness);
			const hs = Array.isArray(attributes.hs_color)
				? attributes.hs_color.map(number)
				: [];
			return {
				type: "light",
				on,
				brightness:
					brightness === null ? null : Math.round((brightness / 255) * 100),
				temperature: number(attributes.color_temp_kelvin),
				minTemperature: number(attributes.min_color_temp_kelvin) ?? 2000,
				maxTemperature: number(attributes.max_color_temp_kelvin) ?? 6500,
				color:
					hs[0] != null && hs[1] != null
						? { hue: hs[0], saturation: hs[1] }
						: null,
				features,
			};
		}
		if (kind === "home-assistant-lock") {
			return {
				type: "lock",
				locked: missing ? null : entity.state === "locked",
				jammed: entity.state === "jammed",
				battery: null,
			};
		}
		if (kind === "home-assistant-fan") {
			const step = number(attributes.percentage_step);
			return {
				type: "fan",
				on,
				speed: number(attributes.percentage),
				speedSteps:
					attributes.percentage === undefined
						? 0
						: Math.round(100 / (step && step > 0 ? step : 1)),
				oscillating:
					typeof attributes.oscillating === "boolean"
						? attributes.oscillating
						: null,
			};
		}
		if (kind === "home-assistant-media") {
			const volume = number(attributes.volume_level);
			const text = (value: unknown) =>
				typeof value === "string" && value ? value : null;
			return {
				type: "media",
				power: missing ? null : entity.state !== "off",
				playback: playbacks[entity.state] ?? null,
				title: text(attributes.media_title),
				artist: text(attributes.media_artist),
				volume: volume === null ? null : Math.round(volume * 100),
				muted:
					typeof attributes.is_volume_muted === "boolean"
						? attributes.is_volume_muted
						: null,
				source: text(attributes.source),
				sources: Array.isArray(attributes.source_list)
					? attributes.source_list.map(String)
					: [],
			};
		}
		if (kind === "home-assistant-button") {
			const pressed = Date.parse(entity.state);
			return {
				type: "button",
				pressedAt: Number.isNaN(pressed)
					? null
					: new Date(pressed).toISOString(),
			};
		}
		if (kind === "home-assistant-sensor") {
			const deviceClass = attributes.device_class;
			const unit = attributes.unit_of_measurement;
			const value = number(entity.state);
			return {
				type: "sensor",
				readings: [
					{
						name:
							typeof deviceClass === "string"
								? deviceClass.replaceAll("_", " ")
								: "Value",
						value: missing
							? null
							: entity.entity_id.startsWith("binary_sensor.")
								? entity.state === "on"
								: (value ?? entity.state),
						unit: typeof unit === "string" && unit ? unit : null,
					},
				],
			};
		}
		return null;
	}

	#controlServices(
		kind: string,
		command: DeviceCommand,
		entityId: string,
	): ServiceCall[] | null {
		if (kind === "home-assistant-light" && command.type === "light") {
			const change = command.change;
			if (change.on === false) {
				return [{ domain: "light", service: "turn_off", data: {} }];
			}
			return [
				{
					domain: "light",
					service: "turn_on",
					data: {
						...(change.brightness === undefined
							? {}
							: { brightness_pct: change.brightness }),
						...(change.temperature === undefined
							? {}
							: { color_temp_kelvin: change.temperature }),
						...(change.color
							? { hs_color: [change.color.hue, change.color.saturation] }
							: {}),
					},
				},
			];
		}
		if (kind === "home-assistant-lock" && command.type === "lock") {
			return [
				{
					domain: "lock",
					service: command.locked ? "lock" : "unlock",
					data: {},
				},
			];
		}
		if (kind === "home-assistant-fan" && command.type === "fan") {
			const change = command.change;
			const calls: ServiceCall[] = [];
			if (change.on !== undefined) {
				calls.push({
					domain: "fan",
					service: change.on ? "turn_on" : "turn_off",
					data: {},
				});
			}
			if (change.speed !== undefined) {
				calls.push({
					domain: "fan",
					service: "set_percentage",
					data: { percentage: change.speed },
				});
			}
			if (change.oscillating !== undefined) {
				calls.push({
					domain: "fan",
					service: "oscillate",
					data: { oscillating: change.oscillating },
				});
			}
			return calls;
		}
		if (kind === "home-assistant-media" && command.type === "media") {
			return this.#mediaServices(command.change);
		}
		if (kind === "home-assistant-button" && command.type === "button") {
			const domain = entityId.split(".")[0] ?? "button";
			return [
				{
					domain,
					service:
						domain === "button" || domain === "input_button"
							? "press"
							: "turn_on",
					data: {},
				},
			];
		}
		return null;
	}

	#mediaServices(
		change: Extract<DeviceCommand, { type: "media" }>["change"],
	): ServiceCall[] {
		const call = (service: string, data: Record<string, unknown> = {}) => ({
			domain: "media_player",
			service,
			data,
		});
		return [
			...(change.power === undefined
				? []
				: [call(change.power ? "turn_on" : "turn_off")]),
			...(change.action ? [call(mediaServices[change.action])] : []),
			...(change.volume === undefined
				? []
				: [call("volume_set", { volume_level: change.volume / 100 })]),
			...(change.muted === undefined
				? []
				: [call("volume_mute", { is_volume_muted: change.muted })]),
			...(change.source === undefined
				? []
				: [call("select_source", { source: change.source })]),
		];
	}

	#haMode(mode: ClimateMode, hvacModes: string[]): string {
		return (
			hvacModes.find((entry) => climateModes[entry] === mode) ??
			(mode === "fan" ? "fan_only" : mode)
		);
	}
}

export const haMapping = new HaMapping();
