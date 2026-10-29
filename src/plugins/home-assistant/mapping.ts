import type { ClimateMode, DeviceState } from "#lib/devices.js";
import type { DeviceCommand, FoundDevice } from "#lib/plugin-sdk.js";

import type { HaState } from "./client.js";

export interface ServiceCall {
	domain: string;
	service: string;
	data: Record<string, unknown>;
}

const contactClasses = new Set(["door", "window", "opening", "garage_door"]);
const switchDomains = new Set(["switch", "light", "input_boolean", "fan"]);

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
		return null;
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
	): ServiceCall[] {
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

	#haMode(mode: ClimateMode, hvacModes: string[]): string {
		return (
			hvacModes.find((entry) => climateModes[entry] === mode) ??
			(mode === "fan" ? "fan_only" : mode)
		);
	}
}

export const haMapping = new HaMapping();
