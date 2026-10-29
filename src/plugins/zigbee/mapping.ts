import type {
	ContactState,
	DeviceState,
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
	kind: "zigbee-contact" | "zigbee-valve" | "zigbee-switch" | "zigbee-meter";
	ieeeAddress: string;
	friendlyName: string;
	name: string;
	state: DeviceState;
}

const setpoints = ["occupied_heating_setpoint", "current_heating_setpoint"];

/** Zigbee2MQTT's devices and messages, mapped to LocalAssistant's kinds and states. */
class Zigbee {
	/** The devices of a `bridge/devices` message LocalAssistant knows how to show: contacts, valves, switches and meters. */
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
