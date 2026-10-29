import type { ClimateMode, ClimateState, HotWater } from "#lib/devices.js";
import {
	definePlugin,
	type DeviceCommand,
	type FoundDevice,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

const baseUrl = "https://app.melcloud.com/Mitsubishi.Wifi.Client";
const requestTimeoutMs = 15_000;
const capabilitiesTtlMs = 10 * 60_000;

const ataModeCodes: Record<ClimateMode, number> = {
	heat: 1,
	dry: 2,
	cool: 3,
	fan: 7,
	auto: 8,
};

const ataFlags = { power: 0x01, mode: 0x02, targetTemperature: 0x04 };
const atwFlags = {
	power: 0x01,
	targetTemperature: 0x2_0000_0080,
	hotWaterBoost: 0x1_0000,
};

class MelCloudError extends Error {}

type MelCloudState = Record<string, unknown>;

interface ListedDevice {
	DeviceID: number;
	BuildingID: number;
	DeviceName: string;
	Device: Record<string, unknown>;
}

interface Building {
	Structure: {
		Devices: ListedDevice[];
		Areas: { Devices: ListedDevice[] }[];
		Floors: { Devices: ListedDevice[]; Areas: { Devices: ListedDevice[] }[] }[];
	};
}

/** Mitsubishi Electric heat pumps through MELCloud's web API, with the account the admin connected. */
class MelCloud implements Plugin {
	#session: { email: string; contextKey: string } | undefined;
	#capabilities: { devices: ListedDevice[]; fetchedAt: number } | undefined;

	/**
	 * Checks the account by signing in with it.
	 *
	 * @throws MelCloudError when MELCloud refuses the credentials or can't be reached.
	 */
	async connect(values: PluginValues): Promise<void> {
		await this.signIn(String(values.email), String(values.password));
	}

	/**
	 * Signs in with `email` and `password` and returns the session key.
	 *
	 * @throws MelCloudError when MELCloud refuses the credentials or can't be reached.
	 */
	async signIn(email: string, password: string): Promise<string> {
		const response = await this.#fetch("/Login/ClientLogin", {
			method: "POST",
			body: JSON.stringify({
				Email: email,
				Password: password,
				Language: 0,
				AppVersion: "1.19.1.1",
				Persist: true,
				CaptchaResponse: null,
			}),
		});
		const body = (await response.json()) as {
			ErrorId: number | null;
			LoginData: { ContextKey: string } | null;
		};
		if (body.ErrorId === 1) {
			throw new MelCloudError("MELCloud refused that email and password.");
		}
		if (body.ErrorId !== null || !body.LoginData) {
			throw new MelCloudError(
				`MELCloud refused the sign-in (error ${body.ErrorId}).`,
			);
		}
		this.#session = { email, contextKey: body.LoginData.ContextKey };
		this.#capabilities = undefined;
		return body.LoginData.ContextKey;
	}

	/**
	 * The air-to-air and air-to-water units on the account.
	 *
	 * @throws MelCloudError when no account is connected or MELCloud can't be reached.
	 */
	async discover(context: PluginContext): Promise<FoundDevice[]> {
		const listed = await this.#listedDevices(context, true);
		return listed.flatMap((entry) => {
			const type = entry.Device.DeviceType;
			if (type !== 0 && type !== 1) {
				return [];
			}
			return [
				{
					kind: type === 0 ? "melcloud-ata" : "melcloud-atw",
					externalId: String(entry.DeviceID),
					name: entry.DeviceName,
					fields: { buildingId: entry.BuildingID },
				},
			];
		});
	}

	/**
	 * Reads a unit's power, mode and temperatures.
	 *
	 * @throws MelCloudError when MELCloud can't be reached or no longer knows the unit.
	 */
	async read(
		device: PluginDevice,
		context: PluginContext,
	): Promise<ClimateState> {
		const state = await this.#state(device, context);
		return this.#climateState(
			device,
			state,
			await this.#listing(device, context),
		);
	}

	/**
	 * Applies a climate change to a unit and returns what MELCloud reports back.
	 *
	 * @throws MelCloudError when MELCloud can't be reached or rejects the change.
	 */
	async command(
		device: PluginDevice,
		command: DeviceCommand,
		context: PluginContext,
	): Promise<ClimateState> {
		if (command.type !== "climate") {
			throw new MelCloudError("A heat pump only takes climate changes.");
		}
		const change = command.change;
		const state = { ...(await this.#state(device, context)) };
		const atw = device.kind === "melcloud-atw";
		const flags = atw ? atwFlags : ataFlags;
		let effective = 0;
		if (change.power !== undefined) {
			state.Power = change.power;
			effective += flags.power;
		}
		if (change.targetTemperature !== undefined) {
			state[atw ? "SetTemperatureZone1" : "SetTemperature"] =
				Math.round(change.targetTemperature * 2) / 2;
			effective += flags.targetTemperature;
		}
		if (change.hotWaterBoost !== undefined && atw) {
			state.ForcedHotWaterMode = change.hotWaterBoost;
			effective += atwFlags.hotWaterBoost;
		}
		if (change.mode !== undefined && !atw) {
			state.OperationMode = ataModeCodes[change.mode];
			effective += ataFlags.mode;
		}
		state.EffectiveFlags = effective;
		state.HasPendingCommand = true;
		const response = await this.#authorized(
			context,
			`/Device/${atw ? "SetAtw" : "SetAta"}`,
			{ method: "POST", body: JSON.stringify(state) },
		);
		const updated = (await response.json()) as MelCloudState;
		return this.#climateState(
			device,
			updated,
			await this.#listing(device, context),
		);
	}

	#climateState(
		device: PluginDevice,
		state: MelCloudState,
		listing: ListedDevice | undefined,
	): ClimateState {
		const atw = device.kind === "melcloud-atw";
		const capabilities = listing?.Device ?? {};
		return {
			type: "climate",
			power: state.Power === true,
			mode: atw ? null : this.#mode(state.OperationMode),
			modes: atw ? [] : this.#modes(capabilities),
			targetTemperature: this.#number(
				state[atw ? "SetTemperatureZone1" : "SetTemperature"],
			),
			roomTemperature: this.#number(
				state[atw ? "RoomTemperatureZone1" : "RoomTemperature"],
			),
			minTemperature: this.#number(capabilities.MinTempHeat) ?? 10,
			maxTemperature: this.#number(capabilities.MaxTempHeat) ?? (atw ? 30 : 31),
			offline: state.Offline === true,
			hotWater: atw ? this.#hotWater(state, capabilities) : null,
		};
	}

	#hotWater(
		state: MelCloudState,
		capabilities: Record<string, unknown>,
	): HotWater | null {
		const temperature = this.#number(state.TankWaterTemperature);
		if (capabilities.HasHotWaterTank === false || temperature === null) {
			return null;
		}
		return {
			boost: state.ForcedHotWaterMode === true,
			temperature,
			target: this.#number(state.SetTankWaterTemperature),
		};
	}

	#mode(code: unknown): ClimateMode | null {
		const entry = Object.entries(ataModeCodes).find(
			([, value]) => value === code,
		);
		return entry ? (entry[0] as ClimateMode) : null;
	}

	#modes(capabilities: Record<string, unknown>): ClimateMode[] {
		const modes: ClimateMode[] = [];
		if (capabilities.CanHeat !== false) {
			modes.push("heat");
		}
		if (capabilities.CanDry === true) {
			modes.push("dry");
		}
		if (capabilities.CanCool === true) {
			modes.push("cool");
		}
		modes.push("fan");
		if (capabilities.ModelSupportsAuto === true) {
			modes.push("auto");
		}
		return modes;
	}

	#number(value: unknown): number | null {
		return typeof value === "number" ? value : null;
	}

	async #state(
		device: PluginDevice,
		context: PluginContext,
	): Promise<MelCloudState> {
		const response = await this.#authorized(
			context,
			`/Device/Get?id=${encodeURIComponent(device.externalId)}&buildingID=${Number(device.fields.buildingId ?? 0)}`,
			{ method: "GET" },
		);
		return (await response.json()) as MelCloudState;
	}

	async #listing(
		device: PluginDevice,
		context: PluginContext,
	): Promise<ListedDevice | undefined> {
		const listed = await this.#listedDevices(context, false);
		return listed.find((entry) => String(entry.DeviceID) === device.externalId);
	}

	async #listedDevices(
		context: PluginContext,
		fresh: boolean,
	): Promise<ListedDevice[]> {
		if (
			!fresh &&
			this.#capabilities &&
			Date.now() - this.#capabilities.fetchedAt < capabilitiesTtlMs
		) {
			return this.#capabilities.devices;
		}
		const response = await this.#authorized(context, "/User/ListDevices", {
			method: "GET",
		});
		const buildings = (await response.json()) as Building[];
		const all = buildings.flatMap(({ Structure }) => [
			...Structure.Devices,
			...Structure.Areas.flatMap((area) => area.Devices),
			...Structure.Floors.flatMap((floor) => [
				...floor.Devices,
				...floor.Areas.flatMap((area) => area.Devices),
			]),
		]);
		const devices = [
			...new Map(all.map((entry) => [entry.DeviceID, entry])).values(),
		];
		this.#capabilities = { devices, fetchedAt: Date.now() };
		return devices;
	}

	async #authorized(
		context: PluginContext,
		path: string,
		init: RequestInit,
	): Promise<Response> {
		const account = context.settings();
		if (!account) {
			throw new MelCloudError("No MELCloud account is connected.");
		}
		const email = String(account.email);
		const password = String(account.password);
		const contextKey =
			this.#session?.email === email
				? this.#session.contextKey
				: await this.signIn(email, password);
		const response = await this.#fetch(path, init, contextKey);
		if (response.status !== 401) {
			return response;
		}
		const renewed = await this.signIn(email, password);
		return this.#fetch(path, init, renewed);
	}

	async #fetch(
		path: string,
		init: RequestInit,
		contextKey?: string,
	): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(`${baseUrl}${path}`, {
				...init,
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
					...(contextKey ? { "X-MitsContextKey": contextKey } : {}),
				},
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
		} catch (error) {
			throw new MelCloudError("MELCloud can't be reached right now.", {
				cause: error,
			});
		}
		if (response.status === 429) {
			throw new MelCloudError(
				"MELCloud is rate limiting this account, try again in a few minutes.",
			);
		}
		if (!response.ok && response.status !== 401) {
			throw new MelCloudError(`MELCloud answered ${response.status}.`);
		}
		return response;
	}
}

export default definePlugin(new MelCloud());
