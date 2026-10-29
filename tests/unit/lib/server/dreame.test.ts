import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { setSetting } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";
import { dreameCloud, DreameError } from "#lib/server/devices/dreame.js";

import { homeId, resetDatabase } from "../../database.js";

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
	setSetting("dreame", {
		email: "ada@example.com",
		region: "eu",
		encryptedPassword: secrets.encrypt("hunter2"),
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
		expect(dreameCloud.configured()).toBe(true);
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
		expect(await dreameCloud.devices()).toEqual([
			{
				did: "123456",
				name: "X30 Ultra",
				bindDomain: "10001.mt.eu.iot.dreame.tech:19973",
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
		});
		const read = JSON.parse(calls.at(-1)?.body ?? "{}");
		expect(read.sign).toBe(
			new Bun.CryptoHasher("md5")
				.update(
					`data=[did="123456"&id=${read.id}&method="get_properties"]&did=123456&id=${read.id}${read.timestamp}EETjszu*XI5znHsI`,
				)
				.digest("hex"),
		);
		await devices.vacuum(robot, "start");
		expect(JSON.parse(calls.at(-1)?.body ?? "{}").data).toMatchObject({
			method: "action",
			params: { did: "123456", siid: 2, aiid: 1, in: [] },
		});
		expect(
			devices.vacuum(
				DeviceDTO.upsert({
					kind: "app",
					homeId: homeId(),
					name: "Phone",
					externalId: "browser",
				}),
				"start",
			),
		).rejects.toThrow("That device is not a robot vacuum.");
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
		expect(dreameCloud.command(robot, "dock")).rejects.toBeInstanceOf(
			DreameError,
		);
	});
});
