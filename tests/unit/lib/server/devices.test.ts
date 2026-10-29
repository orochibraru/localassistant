import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

import { eq } from "drizzle-orm";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { getPluginSettings, setPluginSettings } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { device, job, user } from "#lib/server/db/schema.js";

import { createUser, homeId, resetDatabase } from "../../database.js";
import { addDevice, hosted, pluginOf } from "../../plugins/support.js";

const tuya = {
	options: [] as Record<string, unknown>[],
	sets: [] as Record<string, unknown>[],
	dps: { "1": "stop", "3": 40 } as Record<string, unknown>,
	failConnect: false,
	disconnected: 0,
};

mock.module("tuyapi", () => ({
	default: class {
		constructor(options: Record<string, unknown>) {
			tuya.options.push(options);
		}

		on() {
			return this;
		}

		connect() {
			return tuya.failConnect
				? Promise.reject(new Error("connection timed out"))
				: Promise.resolve(true);
		}

		get() {
			return Promise.resolve({ dps: tuya.dps });
		}

		set(options: Record<string, unknown>) {
			tuya.sets.push(options);
			return Promise.resolve({ dps: {} });
		}

		disconnect() {
			tuya.disconnected += 1;
		}
	},
}));

const { devices } = await import("#lib/server/devices/devices.js");
const melCloud = pluginOf<{
	signIn(email: string, password: string): Promise<string>;
}>("melcloud");
const melCloudContext = hosted("melcloud").context;
const { jobHandlers } = await import("#lib/server/jobs/handlers.js");

interface Call {
	url: string;
	method: string;
	body: Record<string, unknown> | undefined;
	contextKey: string | undefined;
}

const melCloudState = {
	DeviceID: 77,
	Power: true,
	OperationMode: 1,
	SetTemperature: 20,
	RoomTemperature: 19.5,
	Offline: false,
};

const building = {
	Structure: {
		Devices: [
			{
				DeviceID: 77,
				BuildingID: 5,
				DeviceName: "Living room",
				Device: {
					DeviceType: 0,
					CanHeat: true,
					CanCool: true,
					CanDry: true,
					ModelSupportsAuto: true,
					MinTempHeat: 10,
					MaxTempHeat: 31,
				},
			},
		],
		Areas: [
			{
				Devices: [
					{
						DeviceID: 78,
						BuildingID: 5,
						DeviceName: "Hot water",
						Device: { DeviceType: 1 },
					},
				],
			},
		],
		Floors: [
			{
				Devices: [
					{
						DeviceID: 79,
						BuildingID: 5,
						DeviceName: "Ventilation",
						Device: { DeviceType: 3 },
					},
				],
				Areas: [],
			},
		],
	},
};

let calls: Call[] = [];
let loginError: number | null = null;
let expiredOnce = false;

function respond(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function fakeMelCloud(input: string | URL | Request, init?: RequestInit) {
	const url = String(input);
	const headers = new Headers(init?.headers);
	const body =
		typeof init?.body === "string"
			? (JSON.parse(init.body) as Record<string, unknown>)
			: undefined;
	calls.push({
		url,
		method: init?.method ?? "GET",
		body,
		contextKey: headers.get("X-MitsContextKey") ?? undefined,
	});
	if (url.endsWith("/Login/ClientLogin")) {
		return Promise.resolve(
			respond({
				ErrorId: loginError,
				LoginData: loginError === null ? { ContextKey: "key-1" } : null,
			}),
		);
	}
	if (expiredOnce) {
		expiredOnce = false;
		return Promise.resolve(respond({}, 401));
	}
	if (url.endsWith("/User/ListDevices")) {
		return Promise.resolve(respond([building]));
	}
	if (url.includes("/Device/Get")) {
		return Promise.resolve(
			respond(
				url.includes("id=78")
					? {
							...melCloudState,
							TankWaterTemperature: 48,
							SetTankWaterTemperature: 50,
							ForcedHotWaterMode: false,
						}
					: melCloudState,
			),
		);
	}
	if (url.endsWith("/Device/SetAta") || url.endsWith("/Device/SetAtw")) {
		return Promise.resolve(respond({ ...melCloudState, ...body }));
	}
	return Promise.resolve(respond({}, 404));
}

function addCover(inverted = false) {
	return addDevice({
		kind: "tuya-cover",
		name: "Bedroom",
		externalId: "bfabcdabcdabcdabcdgh",
		host: "192.168.1.40",
		fields: { protocolVersion: "3.4", inverted },
		secrets: { localKey: "abcdabcdabcdabcd" },
	});
}

function connectMelCloud() {
	setPluginSettings("melcloud", {
		homeId: null,
		values: { email: "ada@example.com" },
		secrets: { password: secrets.encrypt("hunter2") },
	});
}

const coverSettings = {
	name: "Bedroom",
	roomId: null,
	externalId: "bfabcdabcdabcdabcdgh",
	host: "192.168.1.40",
	encryptedSecrets: {},
};

beforeEach(async () => {
	resetDatabase();
	tuya.options = [];
	tuya.sets = [];
	tuya.dps = { "1": "stop", "3": 40 };
	tuya.failConnect = false;
	tuya.disconnected = 0;
	calls = [];
	loginError = null;
	expiredOnce = false;
	spyOn(globalThis, "fetch").mockImplementation(fakeMelCloud as typeof fetch);
	await melCloud.signIn("reset@example.com", "reset");
	mock.restore();
	calls = [];
});

afterEach(() => {
	mock.restore();
});

describe("DeviceDTO", () => {
	test("upserts on kind and external id, keeps the secrets off toJSON", () => {
		const first = addCover();
		const again = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "tuya-cover",
			name: "Bedroom blind",
			externalId: "bfabcdabcdabcdabcdgh",
		});
		expect(again.id).toBe(first.id);
		expect(DeviceDTO.all().map((device) => device.toJSON().name)).toEqual([
			"Bedroom blind",
		]);
		expect(JSON.stringify(again.toJSON())).not.toContain("localKey");
		expect(secrets.decrypt(again.encryptedSecrets().localKey ?? "")).toBe(
			"abcdabcdabcdabcd",
		);
	});

	test("records state, errors, renames and removals", () => {
		const cover = addCover();
		cover.saveState({ type: "cover", position: 30 });
		cover.saveError("unreachable");
		const stored = DeviceDTO.find(cover.id)?.toJSON();
		expect(stored?.state).toEqual({ type: "cover", position: 30 });
		expect(stored?.stateError).toBe("unreachable");
		cover.rename("Office", null);
		expect(DeviceDTO.find(cover.id)?.toJSON().name).toBe("Office");
		cover.configure({
			...coverSettings,
			name: "Office blind",
			host: "192.168.1.41",
			fields: { protocolVersion: "3.5", inverted: true, controlDp: 101 },
			encryptedSecrets: cover.encryptedSecrets(),
		});
		expect(DeviceDTO.find(cover.id)?.toJSON()).toMatchObject({
			name: "Office blind",
			host: "192.168.1.41",
			fields: { protocolVersion: "3.5", inverted: true, controlDp: 101 },
		});
		expect(DeviceDTO.find(cover.id)?.state).toEqual({
			type: "cover",
			position: 30,
		});
		expect(secrets.decrypt(cover.encryptedSecrets().localKey ?? "")).toBe(
			"abcdabcdabcdabcd",
		);
		cover.configure({
			...coverSettings,
			externalId: "bfnewnewnewnewnewnew",
			fields: {},
			encryptedSecrets: { localKey: secrets.encrypt("dcbadcbadcbadcba") },
		});
		expect(secrets.decrypt(cover.encryptedSecrets().localKey ?? "")).toBe(
			"dcbadcbadcbadcba",
		);
		expect(DeviceDTO.find(cover.id)?.state).toBeNull();
		DeviceDTO.upsert({
			homeId: homeId(),
			kind: "melcloud-ata",
			name: "Heat",
			externalId: "77",
		});
		expect(DeviceDTO.removeKinds(["melcloud-ata", "melcloud-atw"])).toBe(1);
		cover.delete();
		expect(DeviceDTO.find(cover.id)).toBeUndefined();
	});
});

describe("Tuya covers", () => {
	test("reads the position over the LAN with the decrypted key", async () => {
		const cover = addCover();
		await devices.refresh(cover);
		expect(tuya.options[0]).toMatchObject({
			id: "bfabcdabcdabcdabcdgh",
			key: "abcdabcdabcdabcd",
			ip: "192.168.1.40",
			version: "3.4",
		});
		expect(DeviceDTO.find(cover.id)?.state).toEqual({
			type: "cover",
			position: 40,
		});
		expect(tuya.disconnected).toBe(1);
	});

	test("inverts a cover that reports 100 when closed, and an unknown position", async () => {
		const cover = addCover(true);
		await devices.refresh(cover);
		expect(DeviceDTO.find(cover.id)?.state).toEqual({
			type: "cover",
			position: 60,
		});
		tuya.dps = { "1": "stop" };
		await devices.refresh(cover);
		expect(DeviceDTO.find(cover.id)?.state).toEqual({
			type: "cover",
			position: null,
		});
	});

	test("the form's blind is known by its device ID", () => {
		expect(
			hosted("tuya").plugin.add?.(
				{ deviceId: "bf1", host: "192.168.1.9" },
				hosted("tuya").context,
			),
		).toEqual({ kind: "tuya-cover", externalId: "bf1", host: "192.168.1.9" });
	});

	test("commands go out and a refresh is queued for when it stops", async () => {
		const cover = addCover(true);
		await devices.command(cover, { type: "cover", move: { action: "open" } });
		await devices.command(cover, { type: "cover", move: { position: 25 } });
		expect(tuya.sets).toEqual([
			{ dps: 1, set: "open" },
			{ dps: 2, set: 75 },
		]);
		expect(JobDTO.isQueued("device.refresh")).toBe(true);
	});

	test("a cover with other data points is read and driven on those", async () => {
		const cover = addCover();
		cover.configure({
			...coverSettings,
			fields: {
				protocolVersion: "3.4",
				inverted: false,
				controlDp: 101,
				positionDp: 102,
				positionStateDp: 103,
			},
			encryptedSecrets: cover.encryptedSecrets(),
		});
		tuya.dps = { "101": "stop", "103": 55 };
		await devices.refresh(cover);
		expect(DeviceDTO.find(cover.id)?.state).toEqual({
			type: "cover",
			position: 55,
		});
		await devices.command(cover, { type: "cover", move: { action: "close" } });
		await devices.command(cover, { type: "cover", move: { position: 20 } });
		expect(tuya.sets).toEqual([
			{ dps: 101, set: "close" },
			{ dps: 102, set: 20 },
		]);
	});

	test("an hour-long outage is pushed to the admins once, and a recovery resets it", async () => {
		createUser("ada");
		databaseConnection
			.get()
			.update(user)
			.set({ role: "admin" })
			.where(eq(user.id, "ada"))
			.run();
		createUser("grace", "Grace");
		const cover = addCover();
		tuya.failConnect = true;
		await devices.refresh(cover);
		expect(JobDTO.isQueued("push.send")).toBe(false);
		databaseConnection
			.get()
			.update(device)
			.set({ unreachableSince: new Date(Date.now() - 61 * 60_000) })
			.where(eq(device.id, cover.id))
			.run();
		await devices.refresh(DeviceDTO.find(cover.id) ?? cover);
		await devices.refresh(DeviceDTO.find(cover.id) ?? cover);
		const pushes = databaseConnection
			.get()
			.select({ payload: job.payload })
			.from(job)
			.where(eq(job.type, "push.send"))
			.all();
		expect(pushes).toHaveLength(1);
		expect(pushes[0]?.payload).toMatchObject({
			userIds: ["ada"],
			title: "Bedroom is unreachable",
		});
		tuya.failConnect = false;
		await devices.refresh(DeviceDTO.find(cover.id) ?? cover);
		expect(DeviceDTO.find(cover.id)?.toJSON()).toMatchObject({
			unreachableSince: null,
			unreachableAlerted: false,
		});
	});

	test("an unreachable cover keeps its error and never throws from refresh", async () => {
		const cover = addCover();
		tuya.failConnect = true;
		await devices.refresh(cover);
		expect(DeviceDTO.find(cover.id)?.toJSON().stateError).toBe(
			"connection timed out",
		);
		expect(tuya.disconnected).toBe(1);
		await expect(
			devices.command(cover, { type: "cover", move: { action: "stop" } }),
		).rejects.toThrow("connection timed out");
	});

	test("refuses a cover with no key and a heat pump given cover commands", async () => {
		const bare = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "tuya-cover",
			name: "Bare",
			externalId: "bf9999999999abcdefgh",
		});
		await expect(
			devices.command(bare, { type: "cover", move: { action: "open" } }),
		).rejects.toThrow("no address or local key");
		const heater = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "melcloud-ata",
			name: "Heat",
			externalId: "77",
		});
		await expect(
			devices.command(heater, { type: "cover", move: { position: 10 } }),
		).rejects.toThrow("not a cover");
		await expect(
			devices.command(bare, { type: "climate", change: { power: true } }),
		).rejects.toThrow("not a heat pump");
	});
});

describe("MELCloud", () => {
	test("lists air-to-air and air-to-water units from every part of a building", async () => {
		spyOn(globalThis, "fetch").mockImplementation(fakeMelCloud as typeof fetch);
		connectMelCloud();
		expect(await melCloud.discover?.(melCloudContext)).toEqual([
			{
				kind: "melcloud-ata",
				externalId: "77",
				name: "Living room",
				fields: { buildingId: 5 },
			},
			{
				kind: "melcloud-atw",
				externalId: "78",
				name: "Hot water",
				fields: { buildingId: 5 },
			},
		]);
		expect(calls[0]?.body).toMatchObject({
			Email: "ada@example.com",
			Password: "hunter2",
		});
		expect(calls[1]?.contextKey).toBe("key-1");
	});

	test("reads and changes an air-to-air unit with the right flags", async () => {
		spyOn(globalThis, "fetch").mockImplementation(fakeMelCloud as typeof fetch);
		connectMelCloud();
		const unit = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "melcloud-ata",
			name: "Living room",
			externalId: "77",
			fields: { buildingId: 5 },
		});
		await devices.refresh(unit);
		expect(DeviceDTO.find(unit.id)?.state).toEqual({
			type: "climate",
			power: true,
			mode: "heat",
			modes: ["heat", "dry", "cool", "fan", "auto"],
			targetTemperature: 20,
			roomTemperature: 19.5,
			minTemperature: 10,
			maxTemperature: 31,
			offline: false,
			hotWater: null,
		});
		await devices.command(unit, {
			type: "climate",
			change: { power: false, mode: "cool", targetTemperature: 21.3 },
		});
		const set = calls.find((call) => call.url.endsWith("/Device/SetAta"));
		expect(set?.body).toMatchObject({
			Power: false,
			OperationMode: 3,
			SetTemperature: 21.5,
			EffectiveFlags: 0x07,
			HasPendingCommand: true,
		});
		expect(DeviceDTO.find(unit.id)?.state).toMatchObject({
			power: false,
			mode: "cool",
			targetTemperature: 21.5,
		});
	});

	test("an air-to-water unit boosts its hot water, and one without a tank has none", async () => {
		spyOn(globalThis, "fetch").mockImplementation(fakeMelCloud as typeof fetch);
		connectMelCloud();
		const unit = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "melcloud-atw",
			name: "Heat pump",
			externalId: "78",
			fields: { buildingId: 5 },
		});
		await devices.refresh(unit);
		expect(DeviceDTO.find(unit.id)?.state).toMatchObject({
			hotWater: { boost: false, temperature: 48, target: 50 },
		});
		await devices.command(unit, {
			type: "climate",
			change: { hotWaterBoost: true },
		});
		const set = calls.find((call) => call.url.endsWith("/Device/SetAtw"));
		expect(set?.body).toMatchObject({
			ForcedHotWaterMode: true,
			EffectiveFlags: 0x1_0000,
		});
		expect(DeviceDTO.find(unit.id)?.state).toMatchObject({
			hotWater: { boost: true, temperature: 48, target: 50 },
		});
		const tankless = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "melcloud-atw",
			name: "Floor heating",
			externalId: "80",
			fields: { buildingId: 5 },
		});
		await devices.refresh(tankless);
		expect(DeviceDTO.find(tankless.id)?.state).toMatchObject({
			hotWater: null,
		});
	});

	test("an air-to-water unit sets zone 1 and has no modes", async () => {
		spyOn(globalThis, "fetch").mockImplementation(fakeMelCloud as typeof fetch);
		connectMelCloud();
		const unit = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "melcloud-atw",
			name: "Floor heating",
			externalId: "78",
			fields: { buildingId: 5 },
		});
		await devices.command(unit, {
			type: "climate",
			change: { targetTemperature: 22, mode: "cool" },
		});
		const set = calls.find((call) => call.url.endsWith("/Device/SetAtw"));
		expect(set?.body).toMatchObject({
			SetTemperatureZone1: 22,
			EffectiveFlags: 0x2_0000_0080,
		});
		expect(DeviceDTO.find(unit.id)?.state).toMatchObject({
			mode: null,
			modes: [],
			maxTemperature: 30,
		});
	});

	test("signs in again once when the session expired", async () => {
		spyOn(globalThis, "fetch").mockImplementation(fakeMelCloud as typeof fetch);
		connectMelCloud();
		await melCloud.discover?.(melCloudContext);
		calls = [];
		expiredOnce = true;
		await melCloud.discover?.(melCloudContext);
		expect(calls.map((call) => call.url.split("/").pop())).toEqual([
			"ListDevices",
			"ClientLogin",
			"ListDevices",
		]);
	});

	test("explains refused credentials, rate limits, outages and a missing account", async () => {
		const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
			fakeMelCloud as typeof fetch,
		);
		loginError = 1;
		await expect(melCloud.signIn("ada@example.com", "wrong")).rejects.toThrow(
			"refused that email and password",
		);
		loginError = 6;
		await expect(melCloud.signIn("ada@example.com", "x")).rejects.toThrow(
			"error 6",
		);
		expect(getPluginSettings("melcloud")).toBeNull();
		await expect(melCloud.discover?.(melCloudContext)).rejects.toThrow(
			"No MELCloud account",
		);
		connectMelCloud();
		loginError = null;
		fetchMock.mockImplementation((() =>
			Promise.resolve(respond({}, 429))) as unknown as typeof fetch);
		await expect(melCloud.signIn("ada@example.com", "x")).rejects.toThrow(
			"rate limiting",
		);
		fetchMock.mockImplementation((() =>
			Promise.resolve(respond({}, 500))) as unknown as typeof fetch);
		await expect(melCloud.signIn("ada@example.com", "x")).rejects.toThrow(
			"answered 500",
		);
		fetchMock.mockImplementation((() =>
			Promise.reject(new TypeError("offline"))) as unknown as typeof fetch);
		const failure = await melCloud
			.signIn("ada@example.com", "x")
			.catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(Error);
		expect(devices.message(failure)).toBe(
			"MELCloud can't be reached right now.",
		);
		expect(devices.message("weird")).toBe("The device didn't answer.");
	});
});

describe("device jobs", () => {
	test("refresh every device and reschedule, or one device by id", async () => {
		const cover = addCover();
		await jobHandlers["devices.refresh"]({});
		expect(DeviceDTO.find(cover.id)?.state).toEqual({
			type: "cover",
			position: 40,
		});
		expect(JobDTO.isQueued("devices.refresh")).toBe(true);
		tuya.dps = { "3": 90 };
		await jobHandlers["device.refresh"]({ deviceId: cover.id });
		expect(DeviceDTO.find(cover.id)?.state).toEqual({
			type: "cover",
			position: 90,
		});
		await jobHandlers["device.refresh"]({ deviceId: "gone" });
	});
});

describe("phones and tablets", () => {
	function addPhone() {
		const owner = createUser("ada");
		return DeviceDTO.upsert({
			kind: "app",
			homeId: homeId(),
			ownerId: owner.id,
			name: "Ada's iPhone",
			externalId: "browser-1",
		});
	}

	test("save what they report and keep the last location until it's withdrawn", async () => {
		const phone = addPhone();
		expect(phone.ownerId).toBe("ada");
		devices.reportApp(phone, {
			battery: 80,
			charging: false,
			platform: "Safari on iPhone",
			location: { latitude: 45.77, longitude: 3.08, accuracy: 12 },
		});
		expect(DeviceDTO.find(phone.id)?.state).toMatchObject({
			type: "app",
			battery: 80,
			location: { latitude: 45.77, longitude: 3.08, accuracy: 12 },
		});
		devices.reportApp(DeviceDTO.find(phone.id) as DeviceDTO, {
			battery: 79,
			charging: true,
			platform: "Safari on iPhone",
		});
		expect(DeviceDTO.find(phone.id)?.state).toMatchObject({
			battery: 79,
			charging: true,
			location: { latitude: 45.77 },
		});
		devices.reportApp(DeviceDTO.find(phone.id) as DeviceDTO, {
			battery: null,
			charging: null,
			platform: "Safari on iPhone",
			location: null,
		});
		expect(DeviceDTO.find(phone.id)?.state).toMatchObject({ location: null });
		await devices.refresh(DeviceDTO.find(phone.id) as DeviceDTO);
		expect(DeviceDTO.find(phone.id)?.toJSON().stateError).toBeNull();
	});

	test("change hands", () => {
		const phone = addPhone();
		phone.setOwner(null);
		expect(DeviceDTO.find(phone.id)?.ownerId).toBeNull();
	});
});
