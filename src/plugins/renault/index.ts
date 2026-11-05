import type { SensorReading, SensorState } from "#lib/devices.js";
import {
	definePlugin,
	type FoundDevice,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

const requestTimeoutMs = 20_000;
const readEveryMs = 10 * 60_000;
const jwtLifetimeSeconds = 900;
const jwtMarginMs = 60_000;
const kamereonApiKey = "YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J";
const modelsReportingWatts = new Set(["X101VE"]);
const missingDataCodes = new Set([
	"err.func.403",
	"err.tech.501",
	"err.func.wired.notFound",
	"err.func.wired.not-found",
	"err.func.wired.forbidden",
]);

const carEndpoints = [
	["battery-status", 2],
	["cockpit", 1],
	["hvac-status", 1],
	["charge-mode", 1],
] as const;

type CarEndpoint = (typeof carEndpoints)[number][0];
type Attributes = Record<string, unknown>;

interface Region {
	gigyaUrl: string;
	gigyaKey: string;
	kamereonUrl: string;
}

const europe: Region = {
	gigyaUrl: "https://accounts.eu1.gigya.com",
	gigyaKey:
		"3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
	kamereonUrl: "https://api-wired-prod-1-euw1.wrd-aws.com",
};

const regions: Record<string, Region> = {
	fr_FR: europe,
	fr_BE: europe,
	nl_BE: europe,
	fr_CH: europe,
	de_CH: europe,
	it_CH: europe,
	fr_LU: {
		...europe,
		gigyaKey:
			"3_zt44Wl_wT9mnqn-BHrR19PvXj3wYRPQKLcPbGWawlatFR837KdxSZZStbBTDaqnb",
	},
	de_DE: europe,
	de_AT: europe,
	nl_NL: europe,
	en_GB: europe,
	en_IE: europe,
	es_ES: europe,
	pt_PT: europe,
	it_IT: europe,
	pl_PL: europe,
	da_DK: europe,
	sv_SE: europe,
	no_NO: europe,
	fi_FI: europe,
	en_AU: {
		gigyaUrl: "https://gigya-prod-au1.renaultgroup.com",
		gigyaKey: "4_GC9iGd3sH8sMJpz2x0q0CQ",
		kamereonUrl: "https://api-wired-prod-1-apn1.wrd-aws.com",
	},
};

class RenaultError extends Error {}

class MissingDataError extends RenaultError {
	/**
	 * A refusal for data the car doesn't share, keeping Kamereon's error code or HTTP status.
	 */
	constructor(readonly code: string) {
		super(`Renault doesn't share this for the car (${code}).`);
	}
}

interface Session {
	email: string;
	locale: string;
	loginToken: string;
	personId: string;
	jwt: string;
	jwtExpiresAt: number;
}

interface GigyaAnswer {
	errorCode?: number;
	errorDetails?: string;
	errorMessage?: string;
	sessionInfo?: { cookieValue?: string };
	data?: { personId?: string };
	id_token?: string;
}

interface KamereonAnswer {
	errors?: { errorCode?: string; errorMessage?: string }[];
}

interface PersonAnswer extends KamereonAnswer {
	accounts?: { accountId?: string; accountType?: string }[];
}

interface VehicleDetails {
	vin?: string;
	registrationNumber?: string;
	brand?: { label?: string };
	model?: { code?: string; label?: string };
}

interface VehiclesAnswer extends KamereonAnswer {
	vehicleLinks?: { vin?: string; vehicleDetails?: VehicleDetails }[];
}

interface DataAnswer extends KamereonAnswer {
	data?: { attributes?: Attributes };
}

/**
 * Renault cars through the MyRenault cloud: Gigya signs the account in and hands out a short-lived JWT, Kamereon
 * answers with each car's battery, cockpit, climate and charge mode. Read only.
 */
class Renault implements Plugin {
	#session: Session | undefined;
	#readings = new Map<string, { state: SensorState; at: number }>();

	/**
	 * Checks the account by signing in with it.
	 *
	 * @throws RenaultError when MyRenault refuses the credentials or can't be reached.
	 */
	async connect(values: PluginValues): Promise<void> {
		await this.signIn(
			String(values.email),
			String(values.password),
			String(values.locale),
		);
	}

	/**
	 * Signs in to Gigya with `email` and `password` for `locale` and keeps the session and its JWT.
	 *
	 * @throws RenaultError when MyRenault refuses the credentials, asks for a second factor or can't be reached.
	 */
	async signIn(
		email: string,
		password: string,
		locale: string,
	): Promise<Session> {
		const region = this.#region(locale);
		const login = await this.#gigya(region, "accounts.login", {
			loginID: email,
			password,
		});
		const loginToken = login.sessionInfo?.cookieValue;
		if (!loginToken) {
			throw new RenaultError(
				"MyRenault didn't open a session for that account.",
			);
		}
		const info = await this.#gigya(region, "accounts.getAccountInfo", {
			login_token: loginToken,
		});
		const personId = info.data?.personId;
		if (!personId) {
			throw new RenaultError(
				"This account isn't set up in MyRenault yet: sign in to the MyRenault app once, then connect again.",
			);
		}
		const session: Session = {
			email,
			locale,
			loginToken,
			personId,
			...(await this.#newJwt(region, loginToken)),
		};
		this.#session = session;
		this.#readings.clear();
		return session;
	}

	/**
	 * Every car on the account, known by its VIN and named after its model and plate.
	 *
	 * @throws RenaultError when no account is connected, it holds no car, or MyRenault can't be reached.
	 */
	async discover(context: PluginContext): Promise<FoundDevice[]> {
		const session = await this.#current(context);
		const person = await this.#kamereon<PersonAnswer>(
			context,
			`/persons/${encodeURIComponent(session.personId)}`,
		);
		const accountIds = (person.accounts ?? [])
			.toSorted(
				(first, second) =>
					Number(second.accountType === "MYRENAULT") -
					Number(first.accountType === "MYRENAULT"),
			)
			.flatMap((account) => (account.accountId ? [account.accountId] : []));
		const found = new Map<string, FoundDevice>();
		let failure: unknown;
		for (const accountId of accountIds) {
			let vehicles: VehiclesAnswer;
			try {
				vehicles = await this.#kamereon<VehiclesAnswer>(
					context,
					`/accounts/${encodeURIComponent(accountId)}/vehicles`,
				);
			} catch (error) {
				failure ??= error;
				continue;
			}
			for (const link of vehicles.vehicleLinks ?? []) {
				const vin = link.vin ?? link.vehicleDetails?.vin;
				if (!vin || found.has(vin)) {
					continue;
				}
				found.set(vin, {
					kind: "renault-car",
					externalId: vin,
					name: this.#carName(vin, link.vehicleDetails),
					fields: {
						accountId,
						model: link.vehicleDetails?.model?.code ?? "",
					},
				});
			}
		}
		if (found.size === 0 && failure) {
			throw failure;
		}
		return [...found.values()];
	}

	/**
	 * Reads a car's battery, charging, mileage, outside temperature, climate and charge mode, skipping what the model
	 * doesn't share; reuses the last reading for ten minutes to stay under Renault's rate limit.
	 *
	 * @throws RenaultError when MyRenault can't be reached, refuses the account, or shares nothing for the car.
	 */
	async read(
		device: PluginDevice,
		context: PluginContext,
	): Promise<SensorState> {
		const cached = this.#readings.get(device.id);
		if (cached && Date.now() - cached.at < readEveryMs) {
			return cached.state;
		}
		const accountId = device.fields.accountId;
		if (typeof accountId !== "string" || !accountId) {
			throw new RenaultError(
				"Find this car again from the MyRenault integration.",
			);
		}
		await this.#current(context);
		const car = `/accounts/${encodeURIComponent(accountId)}/kamereon/kca/car-adapter`;
		const answers: Partial<Record<CarEndpoint, Attributes>> = {};
		const refusals: string[] = [];
		for (const [endpoint, version] of carEndpoints) {
			try {
				const answer = await this.#kamereon<DataAnswer>(
					context,
					`${car}/v${version}/cars/${encodeURIComponent(device.externalId)}/${endpoint}`,
				);
				answers[endpoint] = answer.data?.attributes ?? {};
			} catch (error) {
				if (!(error instanceof MissingDataError)) {
					throw error;
				}
				refusals.push(`${endpoint} ${error.code}`);
				context.logger.debug(
					"Renault car doesn't share this",
					{ device: device.id, endpoint },
					error,
				);
			}
		}
		if (Object.keys(answers).length === 0) {
			throw new RenaultError(
				`Renault shares no data for this car (${refusals.join(", ")}): find it again from the MyRenault integration, and check the car's connected services are active in the MyRenault app.`,
			);
		}
		const state = this.#sensorState(answers, String(device.fields.model ?? ""));
		this.#readings.set(device.id, { state, at: Date.now() });
		return state;
	}

	/** Turns Kamereon's answers into the card's readings, leaving out what the car didn't report. */
	#sensorState(
		answers: Partial<Record<CarEndpoint, Attributes>>,
		model: string,
	): SensorState {
		const battery = answers["battery-status"] ?? {};
		const cockpit = answers.cockpit ?? {};
		const hvac = answers["hvac-status"] ?? {};
		const charging = battery.chargingStatus === 1;
		const power = this.#number(battery.chargingInstantaneousPower);
		const mileage = this.#number(cockpit.totalMileage);
		const readings: SensorReading[] = [
			{ name: "Battery", value: this.#number(battery.batteryLevel), unit: "%" },
			{
				name: "Range",
				value: this.#number(battery.batteryAutonomy),
				unit: "km",
			},
			{ name: "Charging", value: this.#charging(battery), unit: null },
			{
				name: "Charging power",
				value:
					charging && power !== null
						? Math.round(
								(modelsReportingWatts.has(model) ? power / 1000 : power) * 10,
							) / 10
						: null,
				unit: "kW",
			},
			{
				name: "Time to full",
				value: charging ? this.#number(battery.chargingRemainingTime) : null,
				unit: "min",
			},
			{
				name: "Mileage",
				value: mileage === null ? null : Math.round(mileage),
				unit: "km",
			},
			{
				name: "Outside",
				value: this.#number(hvac.externalTemperature),
				unit: "°C",
			},
			{
				name: "Climate control",
				value: this.#switchedOn(hvac.hvacStatus),
				unit: null,
			},
			{
				name: "Charge mode",
				value: this.#chargeMode(answers["charge-mode"]?.chargeMode),
				unit: null,
			},
		];
		return {
			type: "sensor",
			readings: readings.filter((reading) => reading.value !== null),
		};
	}

	/** The plug and charge state in words, or null when the car reports neither. */
	#charging(battery: Attributes): string | null {
		if (battery.chargingStatus === 1) {
			return "Charging";
		}
		if (battery.plugStatus === 0) {
			return "Unplugged";
		}
		if (battery.plugStatus !== 1) {
			return null;
		}
		if (battery.chargingStatus === 0.1) {
			return "Waiting for its schedule";
		}
		if (battery.chargingStatus === 0.2) {
			return "Charge ended";
		}
		return "Plugged in";
	}

	/** Whether the climate control runs, from Kamereon's "on" or "off". */
	#switchedOn(status: unknown): boolean | null {
		if (status === "on" || status === "off") {
			return status === "on";
		}
		return null;
	}

	/** The charge mode in words: always, scheduled, or Kamereon's own name for anything else. */
	#chargeMode(mode: unknown): string | null {
		if (typeof mode !== "string" || !mode) {
			return null;
		}
		if (mode === "always" || mode === "always_charging") {
			return "Always";
		}
		if (mode === "scheduled" || mode === "schedule_mode") {
			return "Scheduled";
		}
		return mode.replaceAll("_", " ");
	}

	/** A finite number, or null. */
	#number(value: unknown): number | null {
		return typeof value === "number" && Number.isFinite(value) ? value : null;
	}

	/** The model and plate, else the VIN. */
	#carName(vin: string, details: VehicleDetails | undefined): string {
		const model = details?.model?.label ?? details?.brand?.label;
		return (
			[model, details?.registrationNumber].filter(Boolean).join(" ") || vin
		);
	}

	/**
	 * The servers and keys for a MyRenault country.
	 *
	 * @throws RenaultError for a country it doesn't know.
	 */
	#region(locale: string): Region {
		const region = regions[locale];
		if (!region) {
			throw new RenaultError(
				"Pick the country of your MyRenault account again.",
			);
		}
		return region;
	}

	/**
	 * The connected account's session, signing in again when the account changed and getting a new JWT when it's
	 * about to expire or `renew` asks for one.
	 *
	 * @throws RenaultError when no account is connected or MyRenault refuses it.
	 */
	async #current(context: PluginContext, renew = false): Promise<Session> {
		const account = context.settings();
		if (!account) {
			throw new RenaultError("No MyRenault account is connected.");
		}
		const email = String(account.email);
		const password = String(account.password);
		const locale = String(account.locale);
		const session = this.#session;
		if (!session || session.email !== email || session.locale !== locale) {
			return this.signIn(email, password, locale);
		}
		if (!renew && Date.now() < session.jwtExpiresAt - jwtMarginMs) {
			return session;
		}
		try {
			Object.assign(
				session,
				await this.#newJwt(this.#region(locale), session.loginToken),
			);
			return session;
		} catch {
			return this.signIn(email, password, locale);
		}
	}

	/**
	 * A new JWT for `loginToken`, and when it expires.
	 *
	 * @throws RenaultError when Gigya refuses the login token or can't be reached.
	 */
	async #newJwt(
		region: Region,
		loginToken: string,
	): Promise<{ jwt: string; jwtExpiresAt: number }> {
		const answer = await this.#gigya(region, "accounts.getJWT", {
			login_token: loginToken,
			fields: "data.personId,data.gigyaDataCenter",
			expiration: String(jwtLifetimeSeconds),
		});
		if (!answer.id_token) {
			throw new RenaultError("MyRenault didn't hand out a token.");
		}
		return {
			jwt: answer.id_token,
			jwtExpiresAt: Date.now() + jwtLifetimeSeconds * 1000,
		};
	}

	/**
	 * Posts `fields` to a Gigya method and returns its answer.
	 *
	 * @throws RenaultError with a sentence for refused credentials, a second factor, or any other Gigya error.
	 */
	async #gigya(
		region: Region,
		method: string,
		fields: Record<string, string>,
	): Promise<GigyaAnswer> {
		const response = await this.#send(`${region.gigyaUrl}/${method}`, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ ApiKey: region.gigyaKey, ...fields }),
		});
		const answer = (await response
			.json()
			.catch(() => null)) as GigyaAnswer | null;
		if (!answer) {
			throw new RenaultError(`MyRenault answered ${response.status}.`);
		}
		if (answer.errorCode === 403042) {
			throw new RenaultError("MyRenault refused that email and password.");
		}
		if (answer.errorCode === 403101) {
			throw new RenaultError(
				"MyRenault asks this account for a code sent by email, which LocalAssistant can't type in yet.",
			);
		}
		if (answer.errorCode) {
			const reason = answer.errorDetails ?? answer.errorMessage;
			throw new RenaultError(
				reason
					? `MyRenault refused the sign-in: ${reason}`
					: `MyRenault refused the sign-in (error ${answer.errorCode}).`,
			);
		}
		if (!response.ok) {
			throw new RenaultError(`MyRenault answered ${response.status}.`);
		}
		return answer;
	}

	/**
	 * GETs a Kamereon path under `/commerce/v1` for the account's country, with a new JWT once if the old one is
	 * refused.
	 *
	 * @throws MissingDataError when the car doesn't share that data; RenaultError for a rate limit, privacy mode or
	 * any other refusal.
	 */
	async #kamereon<Answer extends KamereonAnswer>(
		context: PluginContext,
		path: string,
	): Promise<Answer> {
		let session = await this.#current(context);
		const region = this.#region(session.locale);
		const url = `${region.kamereonUrl}/commerce/v1${path}?country=${session.locale.slice(-2)}`;
		const send = () =>
			this.#send(url, {
				method: "GET",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/vnd.api+json",
					apikey: kamereonApiKey,
					"x-gigya-id_token": session.jwt,
				},
			});
		let response = await send();
		if (response.status === 401) {
			session = await this.#current(context, true);
			response = await send();
		}
		const answer = (await response.json().catch(() => ({}))) as Answer;
		const code = answer.errors?.[0]?.errorCode;
		if (response.status === 429 || code === "err.func.wired.overloaded") {
			throw new RenaultError(
				"Renault is limiting how often this account is read, try again in a while.",
			);
		}
		if (code === "err.func.privacy.on") {
			throw new RenaultError(
				"The car is in privacy mode: turn it off in the car to share its data.",
			);
		}
		if (
			(code && missingDataCodes.has(code)) ||
			[403, 404, 501].includes(response.status)
		) {
			throw new MissingDataError(code ?? String(response.status));
		}
		if (code || !response.ok) {
			throw new RenaultError(
				`Renault answered ${response.status}${code ? ` (${code})` : ""}.`,
			);
		}
		return answer;
	}

	/**
	 * Fetches `url` with a timeout.
	 *
	 * @throws RenaultError when the server can't be reached.
	 */
	async #send(url: string, init: RequestInit): Promise<Response> {
		try {
			return await fetch(url, {
				...init,
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
		} catch (error) {
			throw new RenaultError("MyRenault can't be reached right now.", {
				cause: error,
			});
		}
	}
}

export default definePlugin(new Renault());
