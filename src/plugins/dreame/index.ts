import { createCipheriv } from "node:crypto";

import {
	type DockStatus,
	type VacuumChange,
	type VacuumCommand,
	type VacuumMode,
	type VacuumPart,
	type VacuumStage,
	type VacuumState,
	vacuumSuctions,
} from "#lib/devices.js";
import {
	definePlugin,
	type DeviceCommand,
	type FoundDevice,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

type DreameRegion = "eu" | "us" | "cn" | "sg" | "ru";

const requestTimeoutMs = 15_000;
const settleMs = 30_000;
const appAuthorization = "Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=";
const passwordSalt = "RAylYC%fmSKp7%Tq";
const clientKey = "EETjszu*XI5znHsI";
const appVersion = "cv=a_102060300";
const userAgent = "Dart/3.9 (dart:io)";

const properties = {
	status: { siid: 2, piid: 1 },
	error: { siid: 2, piid: 2 },
	battery: { siid: 3, piid: 1 },
	charging: { siid: 3, piid: 2 },
	lastCleanMinutes: { siid: 4, piid: 2 },
	lastCleanArea: { siid: 4, piid: 3 },
	suction: { siid: 4, piid: 4 },
	mode: { siid: 4, piid: 23 },
	selfWashBase: { siid: 4, piid: 25 },
	cleanGenius: { siid: 4, piid: 50 },
	mainBrush: { siid: 9, piid: 2 },
	sideBrush: { siid: 10, piid: 2 },
	filter: { siid: 11, piid: 1 },
	dustCollection: { siid: 15, piid: 3 },
	mopPads: { siid: 18, piid: 1 },
	silverIon: { siid: 19, piid: 2 },
	detergent: { siid: 20, piid: 1 },
	cleanWaterTank: { siid: 27, piid: 1 },
	dirtyWaterTank: { siid: 27, piid: 2 },
	dustBag: { siid: 27, piid: 3 },
	detergentCartridge: { siid: 27, piid: 4 },
	wetness: { siid: 28, piid: 1 },
} as const;

const partResets: Record<VacuumPart, number> = {
	mainBrush: 9,
	sideBrush: 10,
	filter: 11,
	mopPads: 18,
	silverIon: 19,
	detergent: 20,
};

const dockCodes = {
	cleanWaterTank: ["ok", "missing", "low", "check"],
	dirtyWaterTank: ["ok", "full"],
	dustBag: ["ok", "missing", "check"],
	detergentCartridge: ["ok", "off", "low"],
} satisfies Partial<Record<PropertyName, DockStatus[]>>;

type PropertyName = keyof typeof properties;
type Readings = Partial<Record<PropertyName, number>>;

const modesWithMopLifting: readonly VacuumMode[] = ["both", "mop", "vacuum"];
const modesWithoutMopLifting: readonly VacuumMode[] = ["vacuum", "mop", "both"];

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
	8: "drying",
	9: "washing",
	10: "returning",
	12: "cleaning",
	13: "docked",
};

class DreameError extends Error {}

interface Session {
	email: string;
	accessToken: string;
	expiresAt: number;
	tenantId: string;
	locale: string | null;
}

interface Answer<Data> {
	code: number;
	message?: string;
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
class DreameCloud implements Plugin {
	#session: Session | undefined;
	#requestId = 1;
	readonly #visitor = this.#md5(crypto.randomUUID());

	/**
	 * Checks the account by signing in with it.
	 *
	 * @throws DreameError when Dreame refuses the account or the client, or can't be reached.
	 */
	async connect(values: PluginValues): Promise<void> {
		await this.signIn(
			String(values.email),
			String(values.password),
			String(values.region ?? "eu") as DreameRegion,
		);
	}

	/**
	 * Applies a robot vacuum's cleaning settings, resets a replaced part's wear, then starts, pauses, stops or docks it,
	 * and has the worker read where it's at.
	 *
	 * @throws DreameError when Dreame can't be reached or the robot refuses.
	 */
	async command(
		device: PluginDevice,
		command: DeviceCommand,
		context: PluginContext,
	): Promise<void> {
		if (command.type !== "vacuum") {
			throw new DreameError("A robot vacuum only takes vacuum commands.");
		}
		const change = command.change;
		await this.configure(device, change, context);
		if (change.reset) {
			await this.resetPart(device, change.reset, context);
		}
		if (change.command) {
			await this.#act(device, change.command, context);
		}
		context.refreshLater(device, settleMs);
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
				...this.#headers(email, undefined),
				"content-type": "application/x-www-form-urlencoded",
			},
			body: `grant_type=password&scope=all&platform=ANDROID&type=account&username=${encodeURIComponent(email)}&password=${this.#md5(password + passwordSalt)}`,
		});
		const body = (await response.json().catch(() => ({}))) as {
			access_token?: string;
			expires_in?: number;
			tenant_id?: string;
			region?: string;
			lang?: string;
			country?: string;
			error_description?: string;
			msg?: string;
			remains?: string;
		};
		if (!response.ok || !body.access_token) {
			if (body.error_description?.includes("password")) {
				throw new DreameError(
					`Dreame refused that email and password${body.remains ? ` (${body.remains} tries left before it locks the account)` : ""}.`,
				);
			}
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
			tenantId: body.tenant_id ?? "000000",
			locale:
				body.region && body.lang && body.country
					? `${body.region}|${body.lang}|${body.country}`
					: null,
		};
	}

	/**
	 * The robot vacuums on the account.
	 *
	 * @throws DreameError when no account is connected or Dreame can't be reached.
	 */
	async discover(context: PluginContext): Promise<FoundDevice[]> {
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
		}>(context, "/dreame-user-iot/iotuserbind/device/listV2");
		return (data.page?.records ?? [])
			.filter((record) => record.model?.includes(".vacuum."))
			.map((record) => ({
				kind: "dreame-vacuum",
				externalId: String(record.did),
				name:
					record.customName ||
					record.deviceInfo?.displayName ||
					record.model ||
					"Robot vacuum",
				host: record.bindDomain ?? "",
			}));
	}

	/**
	 * Reads a vacuum's stage, battery, error, cleaning settings, last clean and what's left of its parts.
	 *
	 * @throws DreameError when Dreame can't be reached or the robot is offline.
	 */
	async read(
		device: PluginDevice,
		context: PluginContext,
	): Promise<VacuumState> {
		const values = await this.#get(
			device,
			context,
			Object.keys(properties) as PropertyName[],
		);
		return {
			type: "vacuum",
			stage:
				(values.status === undefined ? undefined : stages[values.status]) ??
				"idle",
			battery: values.battery ?? null,
			charging: values.charging === 1,
			errorCode: values.error || null,
			mode:
				values.mode === undefined
					? null
					: (this.#modes(values)[values.mode & 0b11] ?? null),
			suction:
				values.suction === undefined
					? null
					: (vacuumSuctions[values.suction] ?? null),
			wetness: values.wetness ?? null,
			cleanGenius:
				values.cleanGenius === undefined ? null : values.cleanGenius > 0,
			lastCleanMinutes: values.lastCleanMinutes ?? null,
			lastCleanArea: values.lastCleanArea ?? null,
			partsLeft: {
				mainBrush: values.mainBrush ?? null,
				sideBrush: values.sideBrush ?? null,
				filter: values.filter ?? null,
				mopPads: values.mopPads ?? null,
				silverIon: values.silverIon ?? null,
				detergent: values.detergent ?? null,
			},
			dock: {
				cleanWater: this.#dockStatus(values, "cleanWaterTank"),
				dirtyWater: this.#dockStatus(values, "dirtyWaterTank"),
				dustBag: this.#dockStatus(values, "dustBag"),
				detergent: this.#dockStatus(values, "detergentCartridge"),
			},
		};
	}

	/**
	 * Sets a vacuum's cleaning mode, suction, mop wetness and CleanGenius, leaving alone what `change` doesn't name.
	 *
	 * @throws DreameError when Dreame can't be reached or the robot refuses a setting.
	 */
	async configure(
		device: PluginDevice,
		change: VacuumChange,
		context: PluginContext,
	): Promise<void> {
		const updates: { siid: number; piid: number; value: number | string }[] =
			[];
		if (change.mode) {
			updates.push({
				...properties.mode,
				value: await this.#modeValue(device, change.mode, context),
			});
		}
		if (change.suction) {
			updates.push({
				...properties.suction,
				value: vacuumSuctions.indexOf(change.suction),
			});
		}
		if (change.wetness !== undefined) {
			updates.push({ ...properties.wetness, value: change.wetness });
		}
		if (change.cleanGenius !== undefined) {
			updates.push({
				...properties.cleanGenius,
				value: JSON.stringify({
					k: "SmartHost",
					v: change.cleanGenius ? 1 : 0,
				}),
			});
		}
		if (updates.length === 0) {
			return;
		}
		const results = await this.#send<PropertyResult[]>(
			device,
			context,
			"set_properties",
			updates.map((update) => ({ did: device.externalId, ...update })),
		);
		if (
			Array.isArray(results) &&
			results.some((result) => (result.code ?? 0) !== 0)
		) {
			throw new DreameError("The robot refused that setting.");
		}
	}

	/**
	 * Starts, pauses, stops or docks a vacuum.
	 *
	 * @throws DreameError when Dreame can't be reached or the robot refuses.
	 */
	async #act(
		device: PluginDevice,
		command: VacuumCommand,
		context: PluginContext,
	): Promise<void> {
		await this.#send(device, context, "action", {
			did: device.externalId,
			...commands[command],
			in: [],
		});
	}

	/** The numeric values the robot answered for `names`, leaving out the ones it doesn't have. */
	async #get(
		device: PluginDevice,
		context: PluginContext,
		names: PropertyName[],
	): Promise<Readings> {
		const results = await this.#send<PropertyResult[]>(
			device,
			context,
			"get_properties",
			names.map((name) => ({ did: device.externalId, ...properties[name] })),
		);
		return Object.fromEntries(
			names.flatMap((name) => {
				const found = results.find(
					(result) =>
						result.siid === properties[name].siid &&
						result.piid === properties[name].piid &&
						(result.code ?? 0) === 0,
				);
				const value =
					name === "cleanGenius" && typeof found?.value === "string"
						? this.#smartHost(found.value)
						: found?.value;
				return typeof value === "number" ? [[name, value]] : [];
			}),
		);
	}

	/**
	 * The mode property with its low bits set to `mode`, keeping the mop-wash settings Dreame packs above them.
	 *
	 * @throws DreameError when the robot has no cleaning modes or can't be reached.
	 */
	async #modeValue(
		device: PluginDevice,
		mode: VacuumMode,
		context: PluginContext,
	): Promise<number> {
		const values = await this.#get(device, context, [
			"mode",
			"selfWashBase",
			"dustCollection",
		]);
		if (values.mode === undefined) {
			throw new DreameError("This robot has no cleaning modes.");
		}
		return (values.mode & ~0b11) | this.#modes(values).indexOf(mode);
	}

	/** The CleanGenius level in the robot's smart settings, a JSON list of `{ k, v }` pairs, or undefined without one. */
	#smartHost(settings: string): number | undefined {
		try {
			const entries: unknown = JSON.parse(settings);
			const found = Array.isArray(entries)
				? (entries as { k?: unknown; v?: unknown }[]).find(
						(entry) => entry.k === "SmartHost",
					)
				: undefined;
			return typeof found?.v === "number" ? found.v : undefined;
		} catch {
			return undefined;
		}
	}

	/** The modes in the robot's numbering: a robot with a self-washing, self-emptying dock lifts its mops and swaps vacuum and both. */
	#modes(values: Readings): readonly VacuumMode[] {
		return values.selfWashBase !== undefined &&
			values.dustCollection !== undefined
			? modesWithMopLifting
			: modesWithoutMopLifting;
	}

	/**
	 * Tells the robot a part was replaced, so it counts its wear from new again.
	 *
	 * @throws DreameError when Dreame can't be reached or the robot refuses.
	 */
	async resetPart(
		device: PluginDevice,
		part: VacuumPart,
		context: PluginContext,
	): Promise<void> {
		await this.#send(device, context, "action", {
			did: device.externalId,
			siid: partResets[part],
			aiid: 1,
			in: [],
		});
	}

	/** What the dock says about one of its tanks or cartridges, or null when it doesn't report it. */
	#dockStatus(
		values: Readings,
		name: keyof typeof dockCodes,
	): DockStatus | null {
		const code = values[name];
		return code === undefined ? null : (dockCodes[name][code] ?? "check");
	}

	async #send<Result>(
		device: PluginDevice,
		context: PluginContext,
		method: string,
		params: unknown,
	): Promise<Result> {
		const id = this.#requestId++;
		const host = (device.host ?? "").split(".")[0] || "10000";
		const data = await this.#call<{ result?: Result }>(
			context,
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

	async #call<Data>(
		context: PluginContext,
		path: string,
		payload?: Record<string, unknown>,
	): Promise<Data> {
		const account = context.settings();
		if (!account) {
			throw new DreameError("No Dreamehome account is connected.");
		}
		const email = String(account.email);
		const region = String(account.region ?? "eu") as DreameRegion;
		if (
			this.#session?.email !== email ||
			this.#session.expiresAt < Date.now()
		) {
			await this.signIn(email, String(account.password), region);
		}
		const response = await this.#fetch(region, path, {
			headers: {
				...this.#headers(email, this.#session),
				"content-type": "application/json",
				"dreame-auth": this.#session?.accessToken ?? "",
			},
			body: payload ? JSON.stringify(this.#signed(payload)) : undefined,
		});
		if (response.status === 401) {
			this.#session = undefined;
			throw new DreameError("Dreame ended the session, try again.");
		}
		const body = (await response.json()) as Answer<Data>;
		if (body.code !== 0 || !body.data) {
			throw new DreameError(
				`Dreame refused the request (${body.message ?? `code ${body.code}`}).`,
			);
		}
		return body.data;
	}

	/** The headers its app sends on every request, the encrypted locale once signed in. */
	#headers(
		email: string,
		session: Session | undefined,
	): Record<string, string> {
		const meta = `${appVersion};canvasHash=${this.#md5(`${email}c`).slice(0, 8)};webglHash=${this.#md5(`${email}w`).slice(0, 8)};visitorIdHash=${this.#visitor}`;
		return {
			"user-agent": userAgent,
			"dreame-meta": meta,
			"accept-encoding": "gzip",
			...(session?.locale && { "dreame-rlc": this.#encrypted(session.locale) }),
			"tenant-id": session?.tenantId ?? "000000",
			authorization: appAuthorization,
		};
	}

	/** `payload` with the signature and timestamp its app adds. */
	#signed(payload: Record<string, unknown>): Record<string, unknown> {
		const timestamp = Date.now();
		return {
			...payload,
			sign: this.#md5(
				`${this.#spliced(payload, true)}${timestamp}${clientKey}`,
			),
			timestamp,
		};
	}

	async #fetch(
		region: DreameRegion,
		path: string,
		init: { headers: Record<string, string>; body: string | undefined },
	): Promise<Response> {
		try {
			return await fetch(`https://${region}.iot.dreame.tech:13267${path}`, {
				method: "POST",
				headers: init.headers,
				body: init.body,
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
		} catch (error) {
			throw new DreameError("Dreame can't be reached right now.", {
				cause: error,
			});
		}
	}

	/** The hex MD5 of `text`. */
	#md5(text: string): string {
		return new Bun.CryptoHasher("md5").update(text).digest("hex");
	}

	/** `text` encrypted with the app's key, as its locale header carries it. */
	#encrypted(text: string): string {
		const cipher = createCipheriv("aes-128-ecb", Buffer.from(clientKey), null);
		return Buffer.concat([
			cipher.update(text, "utf8"),
			cipher.final(),
		]).toString("base64");
	}

	/** `value` flattened the way its app signs a request. */
	#spliced(value: Record<string, unknown>, top: boolean): string {
		return Object.keys(value)
			.toSorted()
			.flatMap((key) => {
				const entry = value[key];
				if (Array.isArray(entry)) {
					return top ? [`${key}=${JSON.stringify(entry)}`] : [];
				}
				if (entry !== null && typeof entry === "object") {
					const inner = this.#spliced(entry as Record<string, unknown>, false);
					return [inner ? `${key}=[${inner}]` : `${key}=]`];
				}
				if (entry === null || entry === undefined) {
					return [`${key}=null`];
				}
				if (typeof entry === "boolean" || top) {
					return [`${key}=${String(entry)}`];
				}
				return [`${key}=${JSON.stringify(entry)}`];
			})
			.join("&");
	}
}

export default definePlugin(new DreameCloud());
