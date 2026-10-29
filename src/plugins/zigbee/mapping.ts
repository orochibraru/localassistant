import type {
	ContactState,
	DeviceState,
	LightFeature,
	LightState,
	LockState,
	MeterState,
	SwitchState,
	ValveState,
} from "#lib/devices.js";

type Payload = Record<string, unknown>;

interface Expose {
	type?: string;
	property?: string;
	value_min?: number;
	value_max?: number;
	features?: Expose[];
}

export interface BridgeDevice {
	ieee_address: string;
	friendly_name: string;
	type?: string;
	definition?: { model?: string; vendor?: string; exposes?: Expose[] } | null;
}

export interface ZigbeeDevice {
	kind:
		| "zigbee-contact"
		| "zigbee-valve"
		| "zigbee-light"
		| "zigbee-lock"
		| "zigbee-switch"
		| "zigbee-meter";
	ieeeAddress: string;
	friendlyName: string;
	name: string;
	state: DeviceState;
}

const setpoints = ["occupied_heating_setpoint", "current_heating_setpoint"];

/** Zigbee2MQTT's devices and messages, mapped to LocalAssistant's kinds and states. */
class Zigbee {
	/**
	 * The devices of a `bridge/devices` message LocalAssistant knows how to show: contacts, valves, lights, locks,
	 * switches and meters.
	 */
	devices(bridge: BridgeDevice[]): ZigbeeDevice[] {
		return bridge.flatMap((entry) => {
			if (entry.type === "Coordinator" || !entry.definition) {
				return [];
			}
			const properties = this.#flatten(entry.definition.exposes ?? []);
			const found = this.#classify(entry, properties);
			return found
				? [
						{
							...found,
							ieeeAddress: entry.ieee_address,
							friendlyName: entry.friendly_name,
							name: entry.friendly_name,
						},
					]
				: [];
		});
	}

	/** `previous` updated with a device's message; values it doesn't carry stay as they were. */
	merge(previous: DeviceState, payload: Payload): DeviceState {
		const number = (...keys: string[]) => {
			for (const key of keys) {
				if (typeof payload[key] === "number") {
					return payload[key];
				}
			}
			return undefined;
		};
		const battery = number("battery");
		if (previous.type === "contact") {
			return {
				...previous,
				...(typeof payload.contact === "boolean"
					? { open: !payload.contact }
					: {}),
				...(battery === undefined ? {} : { battery }),
			} satisfies ContactState;
		}
		if (previous.type === "valve") {
			const target = number(previous.setpoint);
			const temperature = number("local_temperature");
			return {
				...previous,
				...(target === undefined ? {} : { target }),
				...(temperature === undefined ? {} : { temperature }),
				...(battery === undefined ? {} : { battery }),
			} satisfies ValveState;
		}
		if (previous.type === "light") {
			return this.#light(previous, payload);
		}
		if (previous.type === "lock") {
			const locked =
				payload.lock_state === "locked" || payload.state === "LOCK"
					? true
					: payload.lock_state === "unlocked" || payload.state === "UNLOCK"
						? false
						: previous.locked;
			return {
				...previous,
				locked,
				jammed: payload.lock_state === "not_fully_locked",
				...(battery === undefined ? {} : { battery }),
			} satisfies LockState;
		}
		const power = number("power", "apparent_power", "active_power");
		const energy = number("energy", "current_summation_delivered");
		const measured = {
			...(power === undefined ? {} : { power }),
			...(energy === undefined ? {} : { energy }),
		};
		if (previous.type === "switch") {
			return {
				...previous,
				...measured,
				...(typeof payload.state === "string"
					? { on: payload.state === "ON" }
					: {}),
			} satisfies SwitchState;
		}
		return previous.type === "meter"
			? ({ ...previous, ...measured } satisfies MeterState)
			: previous;
	}

	#classify(
		entry: BridgeDevice,
		properties: Map<string, Expose>,
	): Pick<ZigbeeDevice, "kind" | "state"> | null {
		if (properties.has("contact")) {
			return {
				kind: "zigbee-contact",
				state: { type: "contact", open: null, battery: null },
			};
		}
		const setpoint = setpoints.find((property) => properties.has(property));
		if (setpoint) {
			const range = properties.get(setpoint);
			return {
				kind: "zigbee-valve",
				state: {
					type: "valve",
					target: null,
					temperature: null,
					battery: null,
					setpoint,
					min: range?.value_min ?? 5,
					max: range?.value_max ?? 30,
					heldBy: null,
					heldTarget: null,
				},
			};
		}
		const types = new Set(
			(entry.definition?.exposes ?? []).map((expose) => expose.type),
		);
		if (types.has("light")) {
			const temperature = properties.get("color_temp");
			const features: LightFeature[] = [];
			if (properties.has("brightness")) {
				features.push("brightness");
			}
			if (temperature) {
				features.push("temperature");
			}
			if (properties.has("color_hs") || properties.has("color_xy")) {
				features.push("color");
			}
			return {
				kind: "zigbee-light",
				state: {
					type: "light",
					on: null,
					brightness: null,
					temperature: null,
					minTemperature: Math.round(
						1_000_000 / (temperature?.value_max ?? 500),
					),
					maxTemperature: Math.round(
						1_000_000 / (temperature?.value_min ?? 153),
					),
					color: null,
					features,
				},
			};
		}
		if (types.has("lock")) {
			return {
				kind: "zigbee-lock",
				state: { type: "lock", locked: null, jammed: false, battery: null },
			};
		}
		if (properties.has("state")) {
			return {
				kind: "zigbee-switch",
				state: { type: "switch", on: null, power: null, energy: null },
			};
		}
		const metered = [
			"current_summation_delivered",
			"apparent_power",
			"power",
			"energy",
		].some((property) => properties.has(property));
		return metered || entry.definition?.model === "ZLinky_TIC"
			? {
					kind: "zigbee-meter",
					state: { type: "meter", power: null, energy: null },
				}
			: null;
	}

	#light(previous: LightState, payload: Payload): LightState {
		const color = payload.color as
			{ hue?: unknown; saturation?: unknown } | undefined;
		return {
			...previous,
			...(typeof payload.state === "string"
				? { on: payload.state === "ON" }
				: {}),
			...(typeof payload.brightness === "number"
				? { brightness: Math.round((payload.brightness / 254) * 100) }
				: {}),
			...(typeof payload.color_temp === "number" && payload.color_temp > 0
				? { temperature: Math.round(1_000_000 / payload.color_temp) }
				: {}),
			...(typeof color?.hue === "number" && typeof color.saturation === "number"
				? { color: { hue: color.hue, saturation: color.saturation } }
				: {}),
		};
	}

	#flatten(exposes: Expose[]): Map<string, Expose> {
		const found = new Map<string, Expose>();
		for (const expose of exposes) {
			if (expose.property) {
				found.set(expose.property, expose);
			}
			for (const [property, feature] of this.#flatten(expose.features ?? [])) {
				found.set(property, feature);
			}
		}
		return found;
	}
}

export const zigbee = new Zigbee();
