type Status = Record<string, unknown>;

export interface ShellyReading {
	channel: string;
	power?: number;
	energy?: number;
}

const phases = ["a", "b", "c"] as const;

/** Shelly Gen2 and later meters over MQTT: their `<prefix>/status/<component>` messages, as one reading per channel. */
class Shelly {
	/** The channels a status message reports, with their power in watts and their energy counter in kWh. */
	readings(component: string, status: Status): ShellyReading[] {
		const [type, index] = component.split(":");
		if (index === undefined) {
			return [];
		}
		if (type === "switch" || type === "pm1") {
			return [
				{
					channel: component,
					power: this.#number(status.apower),
					energy: this.#kilowattHours(
						(status.aenergy as Status | undefined)?.total,
					),
				},
			];
		}
		if (type === "em1") {
			return [{ channel: component, power: this.#number(status.act_power) }];
		}
		if (type === "em1data") {
			return [
				{
					channel: `em1:${index}`,
					energy: this.#kilowattHours(status.total_act_energy),
				},
			];
		}
		if (type === "em") {
			return phases.map((phase) => ({
				channel: `em:${index}:${phase}`,
				power: this.#number(status[`${phase}_act_power`]),
			}));
		}
		if (type === "emdata") {
			return phases.map((phase) => ({
				channel: `em:${index}:${phase}`,
				energy: this.#kilowattHours(status[`${phase}_total_act_energy`]),
			}));
		}
		return [];
	}

	#number(value: unknown): number | undefined {
		return typeof value === "number" ? value : undefined;
	}

	#kilowattHours(value: unknown): number | undefined {
		return typeof value === "number" ? value / 1000 : undefined;
	}
}

export const shelly = new Shelly();
