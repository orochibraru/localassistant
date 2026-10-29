import type { ClimateMode, ClimateState } from "#lib/devices.js";
import {
	definePlugin,
	type DeviceCommand,
	type FoundDevice,
	type Plugin,
	type PluginDevice,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

const requestTimeoutMs = 10_000;

const modes: Record<string, ClimateMode> = {
	HEAT: "heat",
	DRY: "dry",
	COOL: "cool",
	FAN_ONLY: "fan",
	AUTO: "auto",
	HEAT_COOL: "auto",
};

const espModes: Record<ClimateMode, string> = {
	heat: "heat",
	dry: "dry",
	cool: "cool",
	fan: "fan_only",
	auto: "heat_cool",
};

interface ClimateEntity {
	mode?: string;
	target_temperature?: number | string;
	current_temperature?: number | string;
	min_temp?: number | string;
	max_temp?: number | string;
}

/**
 * Mitsubishi indoor units driven locally by an ESPHome CN105 adapter, through ESPHome's `web_server` REST API: no
 * cloud, no rate limit.
 */
class EspHome implements Plugin {
	/** The unit the form describes, known by its adapter's address and climate id. */
	add(values: PluginValues): FoundDevice {
		return {
			kind: "esphome-climate",
			externalId: `${String(values.host)}/${String(values.objectId)}`,
			host: String(values.host),
		};
	}

	/**
	 * Reads the unit's mode and temperatures.
	 *
	 * @throws When the adapter can't be reached or refuses the password.
	 */
	async read(device: PluginDevice): Promise<ClimateState> {
		const response = await this.#request(device, "", "GET");
		return this.state((await response.json()) as ClimateEntity);
	}

	/**
	 * Applies a climate change to the unit, then reads it back.
	 *
	 * @throws When the adapter can't be reached, refuses the password or the change.
	 */
	async command(
		device: PluginDevice,
		command: DeviceCommand,
	): Promise<ClimateState> {
		if (command.type !== "climate") {
			throw new Error("A heat pump only takes climate changes.");
		}
		const change = command.change;
		const current = await this.read(device);
		const query = new URLSearchParams();
		const power = change.power ?? current.power;
		const mode = change.mode ?? current.mode ?? "heat";
		query.set("mode", power ? espModes[mode] : "off");
		if (change.targetTemperature !== undefined) {
			query.set("target_temperature", String(change.targetTemperature));
		}
		await this.#request(device, `/set?${query}`, "POST");
		return this.read(device);
	}

	/** Maps ESPHome's climate entity to a state the climate card shows. */
	state(entity: ClimateEntity): ClimateState {
		const number = (value: number | string | undefined) => {
			const parsed = Number.parseFloat(String(value));
			return Number.isFinite(parsed) ? parsed : null;
		};
		const mode = modes[(entity.mode ?? "").toUpperCase()] ?? null;
		return {
			type: "climate",
			power: (entity.mode ?? "OFF").toUpperCase() !== "OFF",
			mode,
			modes: ["heat", "dry", "cool", "fan", "auto"],
			targetTemperature: number(entity.target_temperature),
			roomTemperature: number(entity.current_temperature),
			minTemperature: number(entity.min_temp) ?? 16,
			maxTemperature: number(entity.max_temp) ?? 31,
			offline: false,
		};
	}

	async #request(
		device: PluginDevice,
		path: string,
		method: "GET" | "POST",
	): Promise<Response> {
		const objectId = device.fields.objectId;
		if (!device.host || !objectId) {
			throw new Error("This unit has no address or climate id.");
		}
		const username = device.fields.username;
		const password = device.secret("password");
		const headers: Record<string, string> =
			username && password
				? { Authorization: `Basic ${btoa(`${String(username)}:${password}`)}` }
				: {};
		let response: Response;
		try {
			response = await fetch(
				`http://${device.host}/climate/${encodeURIComponent(String(objectId))}${path}`,
				{ method, headers, signal: AbortSignal.timeout(requestTimeoutMs) },
			);
		} catch (error) {
			throw new Error(
				"The ESPHome adapter can't be reached. Check its address.",
				{
					cause: error,
				},
			);
		}
		if (response.status === 401) {
			throw new Error("The ESPHome adapter refused the username and password.");
		}
		if (response.status === 404) {
			throw new Error(
				"The adapter has no climate with that id. Check it in its web page.",
			);
		}
		if (!response.ok) {
			throw new Error(`The ESPHome adapter answered ${response.status}.`);
		}
		return response;
	}
}

export default definePlugin(new EspHome());
