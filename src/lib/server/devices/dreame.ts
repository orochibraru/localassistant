import type {
	DreameRegion,
	VacuumCommand,
	VacuumStage,
	VacuumState,
} from "#lib/devices.js";
import type { DeviceDTO } from "#lib/dto/device.js";
import { getSetting } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";

const requestTimeoutMs = 15_000;
const appAuthorization = "Basic ZHJlYW1lX2FwcGJ2OkFQXmR2QHpAU1FZVnhOODg=";
const passwordSalt = "RAylYC%fmSKp7%Tq";
const userAgent = "Dreame_Smarthome/2.1.9 (iPhone; iOS 18.4.1; Scale/3.00)";

const properties = {
	status: { siid: 2, piid: 1 },
	error: { siid: 2, piid: 2 },
	battery: { siid: 3, piid: 1 },
	charging: { siid: 3, piid: 2 },
} as const;

const commands: Record<VacuumCommand, { siid: number; aiid: number }> = {
	start: { siid: 2, aiid: 1 },
	pause: { siid: 2, aiid: 2 },
	dock: { siid: 3, aiid: 1 },
	stop: { siid: 4, aiid: 2 },
};

const stages: Record<number, VacuumStage> = {
	1: "cleaning",
	2: "idle",
	3: "paused",
	4: "error",
	5: "returning",
	6: "charging",
	7: "cleaning",
	8: "washing",
	9: "washing",
	10: "returning",
	12: "cleaning",
	13: "docked",
};

export class DreameError extends Error {}

export interface DreameVacuum {
	did: string;
	name: string;
	bindDomain: string;
}

interface Session {
	email: string;
	accessToken: string;
	expiresAt: number;
}

interface Answer<Data> {
	code: number;
	msg?: string;
	data?: Data;
}

interface PropertyResult {
	siid: number;
	piid: number;
	value?: unknown;
	code?: number;
}

/**
 * Dreame robot vacuums through the Dreamehome cloud, signing in as its app does over standard TLS. Dreame may refuse
 * clients other than its app; the error then says so plainly.
 */
class DreameCloud {
	#session: Session | undefined;
	#requestId = 1;

	/** Whether an admin connected a Dreamehome account. */
	configured(): boolean {
		return getSetting("dreame") !== null;
	}

	/**
	 * Signs in with the Dreamehome account and keeps the token for the next calls.
	 *
	 * @throws DreameError when Dreame refuses the account or the client, or can't be reached.
	 */
	async signIn(
		email: string,
		password: string,
		region: DreameRegion,
	): Promise<void> {
		const response = await this.#fetch(region, "/dreame-auth/oauth/token", {
			headers: {
				Authorization: appAuthorization,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				platform: "IOS",
				scope: "all",
				grant_type: "password",
				username: email,
				password: new Bun.CryptoHasher("md5")
					.update(password + passwordSalt)
					.digest("hex"),
				type: "account",
			}).toString(),
		});
		const body = (await response.json().catch(() => ({}))) as {
			access_token?: string;
			expires_in?: number;
			error_description?: string;
			msg?: string;
		};
		if (!response.ok || !body.access_token) {
			throw new DreameError(
				response.status === 400 || response.status === 401
					? "Dreame refused that email and password."
					: `Dreame refused the sign-in from LocalAssistant (${body.error_description ?? body.msg ?? `HTTP ${response.status}`}). It may only accept its own app.`,
			);
		}
		this.#session = {
			email,
			accessToken: body.access_token,
			expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 - 60_000,
		};
	}

	/**
	 * The robot vacuums on the account.
	 *
	 * @throws DreameError when no account is connected or Dreame can't be reached.
	 */
	async devices(): Promise<DreameVacuum[]> {
		const data = await this.#call<{
			page?: {
				records?: {
					did: string;
					model?: string;
					customName?: string;
					bindDomain?: string;
					deviceInfo?: { displayName?: string };
				}[];
			};
		}>("/dreame-user-iot/iotuserbind/device/listV2", {
			sharedStatus: 1,
			current: 1,
			size: 100,
			lang: "en",
		});
		return (data.page?.records ?? [])
			.filter((record) => record.model?.includes(".vacuum."))
			.map((record) => ({
				did: String(record.did),
				name:
					record.customName ||
					record.deviceInfo?.displayName ||
					record.model ||
					"Robot vacuum",
				bindDomain: record.bindDomain ?? "",
			}));
	}

	/**
	 * Reads a vacuum's stage, battery and error.
	 *
	 * @throws DreameError when Dreame can't be reached or the robot is offline.
	 */
	async read(device: DeviceDTO): Promise<VacuumState> {
		const entries = Object.values(properties);
		const results = await this.#send<PropertyResult[]>(
			device,
			"get_properties",
			entries.map((property) => ({ did: device.externalId, ...property })),
		);
		const value = (property: { siid: number; piid: number }) => {
			const found = results.find(
				(result) =>
					result.siid === property.siid &&
					result.piid === property.piid &&
					(result.code ?? 0) === 0,
			);
			return typeof found?.value === "number" ? found.value : null;
		};
		const status = value(properties.status);
		const error = value(properties.error);
		return {
			type: "vacuum",
			stage: (status !== null ? stages[status] : undefined) ?? "idle",
			battery: value(properties.battery),
			charging: value(properties.charging) === 1,
			errorCode: error && error !== 0 ? error : null,
		};
	}

	/**
	 * Starts, pauses, stops or docks a vacuum.
	 *
	 * @throws DreameError when Dreame can't be reached or the robot refuses.
	 */
	async command(device: DeviceDTO, command: VacuumCommand): Promise<void> {
		await this.#send(device, "action", {
			did: device.externalId,
			...commands[command],
			in: [],
		});
	}

	async #send<Result>(
		device: DeviceDTO,
		method: string,
		params: unknown,
	): Promise<Result> {
		const id = this.#requestId++;
		const host = (device.toJSON().host ?? "").split(".")[0] || "10000";
		const data = await this.#call<{ result?: Result }>(
			`/dreame-iot-com-${host}/device/sendCommand`,
			{
				did: device.externalId,
				id,
				data: { did: device.externalId, id, method, params },
			},
		);
		if (data.result === undefined) {
			throw new DreameError("The robot didn't answer: it may be offline.");
		}
		return data.result;
	}

	async #call<Data>(path: string, payload: unknown): Promise<Data> {
		const account = getSetting("dreame");
		if (!account) {
			throw new DreameError("No Dreamehome account is connected.");
		}
		if (
			this.#session?.email !== account.email ||
			this.#session.expiresAt < Date.now()
		) {
			await this.signIn(
				account.email,
				secrets.decrypt(account.encryptedPassword),
				account.region,
			);
		}
		const response = await this.#fetch(account.region, path, {
			headers: {
				"Content-Type": "application/json",
				"Dreame-Auth": `bearer ${this.#session?.accessToken}`,
			},
			body: JSON.stringify(payload),
		});
		if (response.status === 401) {
			this.#session = undefined;
			throw new DreameError("Dreame ended the session, try again.");
		}
		const body = (await response.json()) as Answer<Data>;
		if (body.code !== 0 || !body.data) {
			throw new DreameError(
				`Dreame refused the request (${body.msg ?? `code ${body.code}`}).`,
			);
		}
		return body.data;
	}

	async #fetch(
		region: DreameRegion,
		path: string,
		init: { headers: Record<string, string>; body: string },
	): Promise<Response> {
		try {
			return await fetch(`https://${region}.iot.dreame.tech:13267${path}`, {
				method: "POST",
				headers: {
					Accept: "*/*",
					"Accept-Language": "en-US;q=0.8",
					"User-Agent": userAgent,
					"Tenant-Id": "000000",
					...init.headers,
				},
				body: init.body,
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
		} catch (error) {
			throw new DreameError("Dreame can't be reached right now.", {
				cause: error,
			});
		}
	}
}

export const dreameCloud = new DreameCloud();
