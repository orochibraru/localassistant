import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { VacuumChange } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { setPluginSettings } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";

import { homeId, resetDatabase } from "../database.js";
import { hosted, pluginOf, seen } from "./support.js";

const plugin = pluginOf<{
	signIn(email: string, password: string, region: string): Promise<void>;
	configure(
		device: unknown,
		change: VacuumChange,
		context: unknown,
	): Promise<void>;
}>("dreame");
const context = hosted("dreame").context;
const dreameCloud = {
	signIn: (email: string, password: string, region: string) =>
		plugin.signIn(email, password, region),
	discover: () => plugin.discover?.(context),
	read: (device: DeviceDTO) => plugin.read?.(seen(device), context),
	configure: (device: DeviceDTO, change: VacuumChange) =>
		plugin.configure(seen(device), change, context),
	command: (device: DeviceDTO, command: "dock") =>
		plugin.command?.(
			seen(device),
			{ type: "vacuum", change: { command } },
			context,
		),
};

interface Call {
	url: string;
	headers: Record<string, string>;
	body: string;
}

let calls: Call[] = [];
let answers: Record<string, () => Response> = {};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

function connect() {
	setPluginSettings("dreame", {
		homeId: null,
		values: { email: "ada@example.com", region: "eu" },
		secrets: { password: secrets.encrypt("hunter2") },
	});
}

function addRobot() {
	return DeviceDTO.upsert({
		kind: "dreame-vacuum",
		homeId: homeId(),
		name: "X30",
		externalId: "123456",
		host: "10001.mt.eu.iot.dreame.tech:19973",
	});
}

beforeEach(() => {
	resetDatabase();
	calls = [];
	answers = {
		"/dreame-auth/oauth/token": () =>
			json({
				access_token: "token",
				expires_in: 7200,
				tenant_id: "000001",
				region: "eu",
				lang: "en",
				country: "FR",
			}),
	};
	spyOn(globalThis, "fetch").mockImplementation((async (
		input: string,
		init: RequestInit,
	) => {
		const url = new URL(input);
		calls.push({
			url: input,
			headers: init.headers as Record<string, string>,
			body: String(init.body),
		});
		const answer = answers[url.pathname];
		if (!answer) {
			throw new Error("offline");
		}
		return answer();
	}) as unknown as typeof fetch);
});

afterEach(() => {
	(globalThis.fetch as unknown as { mockRestore: () => void }).mockRestore();
});

describe("Dreame cloud", () => {
	test("signs in like its app, with the salted password hash", async () => {
		await dreameCloud.signIn("ada@example.com", "hunter2", "eu");
		const [call] = calls;
		expect(call?.url).toBe(
			"https://eu.iot.dreame.tech:13267/dreame-auth/oauth/token",
		);
		expect(call?.headers["tenant-id"]).toBe("000000");
		expect(call?.headers.authorization).toBe(
			"Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=",
		);
		expect(call?.headers["dreame-meta"]).toStartWith("cv=a_102060300;");
		const body = new URLSearchParams(call?.body);
		expect(body.get("username")).toBe("ada@example.com");
		expect(body.get("password")).toBe(
			new Bun.CryptoHasher("md5")
				.update("hunter2RAylYC%fmSKp7%Tq")
				.digest("hex"),
		);
	});

	test("says plainly when Dreame refuses the account or the client", async () => {
		answers["/dreame-auth/oauth/token"] = () => json({}, 401);
		expect(dreameCloud.signIn("ada@example.com", "nope", "eu")).rejects.toThrow(
			"Dreame refused that email and password.",
		);
		answers["/dreame-auth/oauth/token"] = () =>
			json({ error_description: "user password not match", remains: "3" }, 401);
		expect(dreameCloud.signIn("ada@example.com", "nope", "eu")).rejects.toThrow(
			"(3 tries left before it locks the account)",
		);
		answers["/dreame-auth/oauth/token"] = () =>
			json({ msg: "unsupported client" }, 403);
		expect(dreameCloud.signIn("ada@example.com", "x", "eu")).rejects.toThrow(
			"It may only accept its own app.",
		);
		answers = {};
		expect(dreameCloud.signIn("ada@example.com", "x", "eu")).rejects.toThrow(
			"Dreame can't be reached right now.",
		);
	});

	test("lists only the robot vacuums on the account", async () => {
		connect();
		answers["/dreame-user-iot/iotuserbind/device/listV2"] = () =>
			json({
				code: 0,
				data: {
					page: {
						records: [
							{
								did: 123456,
								model: "dreame.vacuum.r2449",
								customName: "",
								deviceInfo: { displayName: "X30 Ultra" },
								bindDomain: "10001.mt.eu.iot.dreame.tech:19973",
							},
							{ did: 9, model: "dreame.hold.w2422" },
						],
					},
				},
			});
		expect(await dreameCloud.discover()).toEqual([
			{
				kind: "dreame-vacuum",
				externalId: "123456",
				name: "X30 Ultra",
				host: "10001.mt.eu.iot.dreame.tech:19973",
			},
		]);
		expect(calls.at(-1)?.headers["dreame-auth"]).toBe("token");
		expect(calls.at(-1)?.headers["tenant-id"]).toBe("000001");
		expect(calls.at(-1)?.headers["dreame-rlc"]).toBeString();
	});

	test("reads the stage, battery and error, and sends commands to the robot's host", async () => {
		connect();
		const robot = addRobot();
		answers["/dreame-iot-com-10001/device/sendCommand"] = () =>
			json({
				code: 0,
				data: {
					result: [
						{ siid: 2, piid: 1, value: 6, code: 0 },
						{ siid: 2, piid: 2, value: 0, code: 0 },
						{ siid: 3, piid: 1, value: 87, code: 0 },
						{ siid: 3, piid: 2, value: 1, code: 0 },
					],
				},
			});
		expect(await dreameCloud.read(robot)).toEqual({
			type: "vacuum",
			stage: "charging",
			battery: 87,
			charging: true,
			errorCode: null,
			mode: null,
			suction: null,
			wetness: null,
			cleanGenius: null,
			lastCleanMinutes: null,
			lastCleanArea: null,
			partsLeft: {
				mainBrush: null,
				sideBrush: null,
				filter: null,
				mopPads: null,
				silverIon: null,
				detergent: null,
			},
			dock: {
				cleanWater: null,
				dirtyWater: null,
				dustBag: null,
				detergent: null,
			},
		});
		const read = JSON.parse(calls.at(-1)?.body ?? "{}");
		expect(read.sign).toBe(
			new Bun.CryptoHasher("md5")
				.update(
					`data=[did="123456"&id=${read.id}&method="get_properties"]&did=123456&id=${read.id}${read.timestamp}EETjszu*XI5znHsI`,
				)
				.digest("hex"),
		);
		await devices.command(robot, {
			type: "vacuum",
			change: { command: "start" },
		});
		expect(JSON.parse(calls.at(-1)?.body ?? "{}").data).toMatchObject({
			method: "action",
			params: { did: "123456", siid: 2, aiid: 1, in: [] },
		});
		expect(
			devices.command(
				DeviceDTO.upsert({
					kind: "app",
					homeId: homeId(),
					name: "Phone",
					externalId: "browser",
				}),
				{ type: "vacuum", change: { command: "start" } },
			),
		).rejects.toThrow("That device is not a robot vacuum.");
	});

	test("reads the cleaning settings, last clean and parts, and writes settings in the robot's numbering", async () => {
		connect();
		const robot = addRobot();
		let mode: number | undefined = 5120;
		let dock = [
			{ siid: 4, piid: 25, value: 2 },
			{ siid: 15, piid: 3, value: 1 },
		];
		answers["/dreame-iot-com-10001/device/sendCommand"] = () => {
			const { data } = JSON.parse(calls.at(-1)?.body ?? "{}") as {
				data: {
					method: string;
					params: { siid: number; piid: number; value: number }[];
				};
			};
			if (data.method === "set_properties") {
				return json({
					code: 0,
					data: {
						result: data.params.map((param) => ({
							...param,
							code: param.siid === 28 && param.value === 31 ? -4004 : 0,
						})),
					},
				});
			}
			return json({
				code: 0,
				data: {
					result: [
						{ siid: 2, piid: 1, value: 8 },
						{ siid: 4, piid: 2, value: 34 },
						{ siid: 4, piid: 3, value: 21 },
						{ siid: 4, piid: 4, value: 1 },
						...(mode === undefined ? [] : [{ siid: 4, piid: 23, value: mode }]),
						...dock,
						{ siid: 9, piid: 2, value: 90 },
						{ siid: 10, piid: 2, value: 85 },
						{ siid: 11, piid: 1, value: 81 },
						{ siid: 18, piid: 1, value: 65 },
						{ siid: 19, piid: 2, value: 100 },
						{ siid: 20, piid: 1, value: 18 },
						{ siid: 27, piid: 1, value: 2 },
						{ siid: 27, piid: 2, value: 0 },
						{ siid: 27, piid: 3, value: 7 },
						{ siid: 28, piid: 1, value: 16 },
						{
							siid: 4,
							piid: 50,
							value: JSON.stringify([
								{ k: "LessColl", v: 1 },
								{ k: "SmartHost", v: 1 },
							]),
						},
					],
				},
			});
		};
		const lastWrite = () =>
			(
				JSON.parse(
					calls.findLast((call) => call.body.includes('"set_properties"'))
						?.body ?? "{}",
				) as { data: { params: unknown[] } }
			).data.params;

		expect(await dreameCloud.read(robot)).toMatchObject({
			stage: "drying",
			mode: "both",
			suction: "standard",
			wetness: 16,
			cleanGenius: true,
			lastCleanMinutes: 34,
			lastCleanArea: 21,
			partsLeft: {
				mainBrush: 90,
				sideBrush: 85,
				filter: 81,
				mopPads: 65,
				silverIon: 100,
				detergent: 18,
			},
			dock: {
				cleanWater: "low",
				dirtyWater: "ok",
				dustBag: "check",
				detergent: null,
			},
		});
		await devices.command(robot, {
			type: "vacuum",
			change: {
				mode: "vacuum",
				suction: "max",
				wetness: 20,
			},
		});
		expect(lastWrite()).toEqual([
			{ did: "123456", siid: 4, piid: 23, value: 5122 },
			{ did: "123456", siid: 4, piid: 4, value: 3 },
			{ did: "123456", siid: 28, piid: 1, value: 20 },
		]);

		dock = [];
		mode = 2;
		expect(await dreameCloud.read(robot)).toMatchObject({ mode: "both" });
		await dreameCloud.configure(robot, { mode: "vacuum" });
		expect(lastWrite()).toEqual([
			{ did: "123456", siid: 4, piid: 23, value: 0 },
		]);

		await devices.command(robot, {
			type: "vacuum",
			change: { reset: "filter" },
		});
		expect(JSON.parse(calls.at(-1)?.body ?? "{}").data).toMatchObject({
			method: "action",
			params: { did: "123456", siid: 11, aiid: 1, in: [] },
		});

		await dreameCloud.configure(robot, { cleanGenius: false });
		expect(lastWrite()).toEqual([
			{
				did: "123456",
				siid: 4,
				piid: 50,
				value: JSON.stringify({ k: "SmartHost", v: 0 }),
			},
		]);

		expect(dreameCloud.configure(robot, { wetness: 31 })).rejects.toThrow(
			"The robot refused that setting.",
		);
		const before = calls.length;
		await dreameCloud.configure(robot, { command: "start" });
		expect(calls.length).toBe(before);

		mode = undefined;
		expect(await dreameCloud.read(robot)).toMatchObject({ mode: null });
		expect(dreameCloud.configure(robot, { mode: "mop" })).rejects.toThrow(
			"This robot has no cleaning modes.",
		);
	});

	test("explains an unknown stage, an offline robot, a refusal, an expired session and no account", async () => {
		const robot = addRobot();
		expect(dreameCloud.read(robot)).rejects.toThrow(
			"No Dreamehome account is connected.",
		);
		connect();
		answers["/dreame-iot-com-10001/device/sendCommand"] = () =>
			json({ code: 0, data: { result: [{ siid: 2, piid: 1, value: 99 }] } });
		expect(await dreameCloud.read(robot)).toMatchObject({
			stage: "idle",
			battery: null,
		});
		answers["/dreame-iot-com-10001/device/sendCommand"] = () =>
			json({ code: 0, data: {} });
		expect(dreameCloud.command(robot, "dock")).rejects.toThrow(
			"it may be offline",
		);
		answers["/dreame-iot-com-10001/device/sendCommand"] = () =>
			json({ code: 10007, message: "device offline" });
		expect(dreameCloud.command(robot, "dock")).rejects.toThrow(
			"Dreame refused the request (device offline).",
		);
		answers["/dreame-iot-com-10001/device/sendCommand"] = () => json({}, 401);
		expect(dreameCloud.command(robot, "dock")).rejects.toBeInstanceOf(Error);
		expect(
			plugin.command?.(seen(robot), { type: "switch", on: true }, context),
		).rejects.toThrow("only takes vacuum commands");
	});
});
