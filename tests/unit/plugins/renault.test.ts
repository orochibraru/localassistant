import {
	afterEach,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	spyOn,
	test,
} from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { setPluginSettings } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";

import { resetDatabase } from "../database.js";
import { addDevice, hosted, pluginOf, seen } from "./support.js";

const plugin = pluginOf<{
	signIn(email: string, password: string, locale: string): Promise<unknown>;
}>("renault");
const context = hosted("renault").context;
const renault = {
	connect: (values: Record<string, string>) =>
		plugin.connect?.(values, context),
	discover: () => plugin.discover?.(context),
	read: (device: DeviceDTO) => plugin.read?.(seen(device), context),
};

const vin = "VF1AG000000000001";
const readEveryMs = 10 * 60_000;
const carPath = `/commerce/v1/accounts/account-1/kamereon/kca/car-adapter`;

interface Call {
	url: URL;
	headers: Record<string, string>;
	body: URLSearchParams;
}

let calls: Call[] = [];
let answers: Record<string, () => Response> = {};
let jwtCount = 0;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

function kamereonError(code: string, status: number): Response {
	return json({ errors: [{ errorCode: code, errorMessage: "No" }] }, status);
}

function connect(email = "ada@example.com") {
	setPluginSettings("renault", {
		homeId: null,
		values: { email, locale: "fr_FR" },
		secrets: { password: secrets.encrypt("hunter2") },
	});
}

function addCar(model = "X102VE") {
	return addDevice({
		kind: "renault-car",
		name: "ZOE",
		externalId: vin,
		fields: { accountId: "account-1", model },
	});
}

function carAnswers(battery: Record<string, unknown>) {
	answers[`${carPath}/v2/cars/${vin}/battery-status`] = () =>
		json({ data: { type: "Car", id: vin, attributes: battery } });
	answers[`${carPath}/v1/cars/${vin}/cockpit`] = () =>
		json({ data: { attributes: { totalMileage: 48_215.62 } } });
	answers[`${carPath}/v1/cars/${vin}/hvac-status`] = () =>
		json({
			data: { attributes: { externalTemperature: 8.5, hvacStatus: "off" } },
		});
	answers[`${carPath}/v1/cars/${vin}/charge-mode`] = () =>
		kamereonError("err.func.wired.forbidden", 403);
}

const calledPaths = () => calls.map((call) => call.url.pathname);

beforeEach(() => {
	resetDatabase();
	calls = [];
	jwtCount = 0;
	answers = {
		"/accounts.login": () =>
			json({ errorCode: 0, sessionInfo: { cookieValue: "login-token" } }),
		"/accounts.getAccountInfo": () =>
			json({ errorCode: 0, data: { personId: "person-1" } }),
		"/accounts.getJWT": () => {
			jwtCount += 1;
			return json({ errorCode: 0, id_token: `jwt-${jwtCount}` });
		},
	};
	spyOn(globalThis, "fetch").mockImplementation((async (
		input: string,
		init: RequestInit,
	) => {
		const url = new URL(input);
		calls.push({
			url,
			headers: init.headers as Record<string, string>,
			body: new URLSearchParams(init.body as URLSearchParams | undefined),
		});
		const answer = answers[url.pathname];
		if (!answer) {
			throw new Error("offline");
		}
		return answer();
	}) as unknown as typeof fetch);
});

afterEach(() => {
	setSystemTime();
	(globalThis.fetch as unknown as { mockRestore: () => void }).mockRestore();
});

describe("Renault (MyRenault)", () => {
	test("connecting signs in to Gigya with the country's key and gets a JWT", async () => {
		await renault.connect({
			email: "ada@example.com",
			password: "hunter2",
			locale: "fr_FR",
		});
		expect(calls.map((call) => call.url.href)).toEqual([
			"https://accounts.eu1.gigya.com/accounts.login",
			"https://accounts.eu1.gigya.com/accounts.getAccountInfo",
			"https://accounts.eu1.gigya.com/accounts.getJWT",
		]);
		expect(Object.fromEntries(calls[0]?.body ?? [])).toEqual({
			ApiKey:
				"3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N",
			loginID: "ada@example.com",
			password: "hunter2",
		});
		expect(calls[2]?.body.get("login_token")).toBe("login-token");
		expect(calls[2]?.body.get("expiration")).toBe("900");

		calls = [];
		await renault.connect({
			email: "ada@example.com",
			password: "hunter2",
			locale: "en_AU",
		});
		expect(calls[0]?.url.origin).toBe(
			"https://gigya-prod-au1.renaultgroup.com",
		);
		expect(calls[0]?.body.get("ApiKey")).toBe("4_GC9iGd3sH8sMJpz2x0q0CQ");
	});

	test("a refused password, a second factor and an outage fail the connection with a sentence", async () => {
		const values = {
			email: "ada@example.com",
			password: "nope",
			locale: "fr_FR",
		};
		answers["/accounts.login"] = () =>
			json({ errorCode: 403042, errorDetails: "invalid loginID or password" });
		await expect(renault.connect(values)).rejects.toThrow(
			"MyRenault refused that email and password.",
		);
		answers["/accounts.login"] = () =>
			json({ errorCode: 403101, regToken: "registration" });
		await expect(renault.connect(values)).rejects.toThrow(
			"asks this account for a code sent by email",
		);
		answers["/accounts.login"] = () =>
			json({ errorCode: 400093, errorDetails: "Invalid ApiKey parameter" });
		await expect(renault.connect(values)).rejects.toThrow(
			"MyRenault refused the sign-in: Invalid ApiKey parameter",
		);
		await expect(
			renault.connect({ ...values, locale: "xx_XX" }),
		).rejects.toThrow("Pick the country");
		answers = {};
		await expect(renault.connect(values)).rejects.toThrow(
			"MyRenault can't be reached right now.",
		);
	});

	test("finds every car on the account, read through its MyRenault account, named by model and plate", async () => {
		connect("discover@example.com");
		answers["/commerce/v1/persons/person-1"] = () =>
			json({
				accounts: [
					{ accountId: "account-2", accountType: "SFDC" },
					{ accountId: "account-1", accountType: "MYRENAULT" },
					{ accountType: "MYDACIA" },
				],
			});
		answers["/commerce/v1/accounts/account-1/vehicles"] = () =>
			json({
				accountId: "account-1",
				vehicleLinks: [
					{
						vin,
						vehicleDetails: {
							vin,
							registrationNumber: "AB-123-CD",
							brand: { label: "RENAULT" },
							model: { code: "X102VE", label: "ZOE" },
						},
					},
					{ vin: "VF1AG000000000002", vehicleDetails: {} },
				],
			});
		answers["/commerce/v1/accounts/account-2/vehicles"] = () =>
			json({ accountId: "account-2", vehicleLinks: [{ vin }] });
		expect(await renault.discover()).toEqual([
			{
				kind: "renault-car",
				externalId: vin,
				name: "ZOE AB-123-CD",
				fields: { accountId: "account-1", model: "X102VE" },
			},
			{
				kind: "renault-car",
				externalId: "VF1AG000000000002",
				name: "VF1AG000000000002",
				fields: { accountId: "account-1", model: "" },
			},
		]);
		const person = calls.find(
			(call) => call.url.pathname === "/commerce/v1/persons/person-1",
		);
		expect(person?.url.origin).toBe(
			"https://api-wired-prod-1-euw1.wrd-aws.com",
		);
		expect(person?.url.searchParams.get("country")).toBe("FR");
		expect(person?.headers.apikey).toBe("YjkKtHmGfaceeuExUDKGxrLZGGvtVS0J");
		expect(person?.headers["x-gigya-id_token"]).toBe("jwt-1");
	});

	test("reads the battery, charging, mileage and climate into sensor readings, skipping what the car doesn't share", async () => {
		connect("read@example.com");
		const car = addCar();
		carAnswers({
			timestamp: "2026-11-05T08:00:00Z",
			batteryLevel: 64,
			batteryAutonomy: 201,
			plugStatus: 1,
			chargingStatus: 1,
			chargingRemainingTime: 145,
			chargingInstantaneousPower: 7.4,
		});
		await devices.refresh(car);
		expect(DeviceDTO.find(car.id)?.state).toEqual({
			type: "sensor",
			readings: [
				{ name: "Battery", value: 64, unit: "%" },
				{ name: "Range", value: 201, unit: "km" },
				{ name: "Charging", value: "Charging", unit: null },
				{ name: "Charging power", value: 7.4, unit: "kW" },
				{ name: "Time to full", value: 145, unit: "min" },
				{ name: "Mileage", value: 48_216, unit: "km" },
				{ name: "Outside", value: 8.5, unit: "°C" },
				{ name: "Climate control", value: false, unit: null },
			],
		});
		expect(calledPaths().filter((path) => path.includes("/cars/"))).toEqual([
			`${carPath}/v2/cars/${vin}/battery-status`,
			`${carPath}/v1/cars/${vin}/cockpit`,
			`${carPath}/v1/cars/${vin}/hvac-status`,
			`${carPath}/v1/cars/${vin}/charge-mode`,
		]);
	});

	test("says plugged, waiting or unplugged, converts a ZOE phase 1's watts and reads the charge mode", async () => {
		connect("states@example.com");
		const zoe = addCar("X101VE");
		carAnswers({
			batteryLevel: 80,
			plugStatus: 1,
			chargingStatus: 1,
			chargingInstantaneousPower: 2250,
		});
		answers[`${carPath}/v1/cars/${vin}/charge-mode`] = () =>
			json({ data: { attributes: { chargeMode: "schedule_mode" } } });
		expect(await renault.read(zoe)).toMatchObject({
			readings: expect.arrayContaining([
				{ name: "Charging power", value: 2.3, unit: "kW" },
				{ name: "Charge mode", value: "Scheduled", unit: null },
			]),
		});

		const cases: [Record<string, unknown>, string | undefined][] = [
			[{ plugStatus: 1, chargingStatus: 0.1 }, "Waiting for its schedule"],
			[{ plugStatus: 1, chargingStatus: 0.2 }, "Charge ended"],
			[{ plugStatus: 1, chargingStatus: 0 }, "Plugged in"],
			[{ plugStatus: 0, chargingStatus: -1 }, "Unplugged"],
			[{ plugStatus: -2_147_483_648 }, undefined],
		];
		for (const [index, [battery, expected]] of cases.entries()) {
			setSystemTime(new Date(Date.now() + (index + 1) * readEveryMs));
			carAnswers({
				batteryLevel: 50,
				chargingInstantaneousPower: 0,
				...battery,
			});
			const state = (await renault.read(zoe)) as {
				readings: { name: string; value: unknown }[];
			};
			const names = state.readings.map((reading) => reading.name);
			expect(names).not.toContain("Charging power");
			expect(names).not.toContain("Time to full");
			expect(
				state.readings.find((reading) => reading.name === "Charging")?.value,
			).toBe(expected);
		}
	});

	test("reuses a reading for ten minutes and renews the JWT without signing in again", async () => {
		connect("cache@example.com");
		const car = addCar();
		carAnswers({ batteryLevel: 40 });
		setSystemTime(new Date("2026-11-05T08:00:00Z"));
		await renault.read(car);
		expect(
			calledPaths().filter((path) => path === "/accounts.login"),
		).toHaveLength(1);
		calls = [];
		setSystemTime(new Date("2026-11-05T08:09:00Z"));
		await renault.read(car);
		expect(calls).toHaveLength(0);
		setSystemTime(new Date("2026-11-05T08:20:00Z"));
		await renault.read(car);
		expect(calledPaths()[0]).toBe("/accounts.getJWT");
		expect(calledPaths()).not.toContain("/accounts.login");
		expect(calls.at(-1)?.headers["x-gigya-id_token"]).toBe("jwt-2");
	});

	test("a refused JWT is renewed once, and an expired login signs in again", async () => {
		connect("renew@example.com");
		const car = addCar();
		carAnswers({ batteryLevel: 40 });
		const batteryPath = `${carPath}/v2/cars/${vin}/battery-status`;
		const battery = answers[batteryPath];
		let refused = false;
		answers[batteryPath] = () => {
			if (!refused) {
				refused = true;
				return json({}, 401);
			}
			return battery?.() ?? json({});
		};
		expect(await renault.read(car)).toMatchObject({
			readings: expect.arrayContaining([
				{ name: "Battery", value: 40, unit: "%" },
			]),
		});
		expect(
			calledPaths().filter((path) => path === "/accounts.getJWT"),
		).toHaveLength(2);

		setSystemTime(new Date(Date.now() + 30 * 60_000));
		calls = [];
		answers["/accounts.getJWT"] = () => {
			answers["/accounts.getJWT"] = () =>
				json({ errorCode: 0, id_token: "jwt-after-login" });
			return json({ errorCode: 403005, errorDetails: "Unauthorized user" });
		};
		await renault.read(car);
		expect(calledPaths().slice(0, 4)).toEqual([
			"/accounts.getJWT",
			"/accounts.login",
			"/accounts.getAccountInfo",
			"/accounts.getJWT",
		]);
		expect(calls.at(-1)?.headers["x-gigya-id_token"]).toBe("jwt-after-login");
	});

	test("explains privacy mode, the rate limit, a car sharing nothing and a car to find again", async () => {
		connect("errors@example.com");
		carAnswers({ batteryLevel: 40 });
		const batteryPath = `${carPath}/v2/cars/${vin}/battery-status`;
		answers[batteryPath] = () => kamereonError("err.func.privacy.on", 400);
		await expect(renault.read(addCar())).rejects.toThrow("privacy mode");
		answers[batteryPath] = () =>
			kamereonError("err.func.wired.overloaded", 400);
		await expect(renault.read(addCar())).rejects.toThrow("limiting how often");
		answers[batteryPath] = () => json({}, 429);
		await expect(renault.read(addCar())).rejects.toThrow("limiting how often");
		for (const path of Object.keys(answers).filter((key) =>
			key.includes("/cars/"),
		)) {
			answers[path] = () => kamereonError("err.func.wired.notFound", 404);
		}
		await expect(renault.read(addCar())).rejects.toThrow(
			"Renault shares no data for this car (battery-status err.func.wired.notFound, cockpit err.func.wired.notFound",
		);
		const lost = addDevice({
			kind: "renault-car",
			name: "Old",
			externalId: "VF1AG000000000009",
		});
		await expect(renault.read(lost)).rejects.toThrow("Find this car again");
		setPluginSettings("renault", null);
		await expect(renault.read(addCar())).rejects.toThrow(
			"No MyRenault account is connected.",
		);
	});
});
