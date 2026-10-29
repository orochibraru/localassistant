import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";
import { espHome } from "#lib/server/devices/esphome.js";
import { espHomeSchema } from "#lib/server/validation/device.js";

import { homeId, resetDatabase } from "../../database.js";

const calls: { url: string; method: string; authorization: string | null }[] =
	[];
let entity: Record<string, unknown> = {};
let status = 200;

function unit(withPassword = false) {
	return DeviceDTO.upsert({
		kind: "esphome-climate",
		homeId: homeId(),
		name: "Living room",
		externalId: "192.0.2.70/living_room",
		host: "192.0.2.70",
		options: { objectId: "living_room" },
		encryptedLocalKey: withPassword
			? secrets.encrypt("admin:secret")
			: undefined,
	});
}

beforeEach(() => {
	resetDatabase();
	calls.length = 0;
	status = 200;
	entity = {
		id: "climate-living_room",
		mode: "HEAT",
		target_temperature: "21.0",
		current_temperature: 19.5,
		min_temp: 16,
		max_temp: 31,
	};
	spyOn(globalThis, "fetch").mockImplementation((async (
		input: string,
		init: RequestInit,
	) => {
		calls.push({
			url: input,
			method: init.method ?? "GET",
			authorization: new Headers(init.headers).get("authorization"),
		});
		if (init.method === "POST") {
			const query = new URL(input).searchParams;
			entity = {
				...entity,
				mode: query.get("mode")?.toUpperCase(),
				target_temperature:
					query.get("target_temperature") ?? entity.target_temperature,
			};
		}
		return Response.json(entity, { status });
	}) as unknown as typeof fetch);
});

afterEach(() => {
	(globalThis.fetch as unknown as { mockRestore: () => void }).mockRestore();
});

describe("ESPHome CN105", () => {
	test("reads the unit and maps ESPHome's modes", async () => {
		const device = unit(true);
		await devices.refresh(device);
		expect(DeviceDTO.find(device.id)?.state).toEqual({
			type: "climate",
			power: true,
			mode: "heat",
			modes: ["heat", "dry", "cool", "fan", "auto"],
			targetTemperature: 21,
			roomTemperature: 19.5,
			minTemperature: 16,
			maxTemperature: 31,
			offline: false,
		});
		expect(calls[0]).toEqual({
			url: "http://192.0.2.70/climate/living_room",
			method: "GET",
			authorization: `Basic ${btoa("admin:secret")}`,
		});
		expect(espHome.state({ mode: "OFF" })).toMatchObject({
			power: false,
			mode: null,
			minTemperature: 16,
			maxTemperature: 31,
			targetTemperature: null,
		});
		expect(espHome.state({ mode: "fan_only" }).mode).toBe("fan");
	});

	test("sets the mode, power and target, then reads back", async () => {
		const device = unit();
		await devices.climate(device, { targetTemperature: 22.5 });
		expect(calls[1]?.url).toBe(
			"http://192.0.2.70/climate/living_room/set?mode=heat&target_temperature=22.5",
		);
		expect(calls[1]?.authorization).toBeNull();
		expect(DeviceDTO.find(device.id)?.state).toMatchObject({
			targetTemperature: 22.5,
		});
		await devices.climate(device, { power: false });
		expect(calls.at(-2)?.url).toEndWith("/set?mode=off");
		await devices.climate(device, { power: true, mode: "cool" });
		expect(calls.at(-2)?.url).toEndWith("/set?mode=cool");
	});

	test("explains what went wrong", async () => {
		const device = unit();
		status = 401;
		expect(espHome.read(device)).rejects.toThrow(
			"refused the username and password",
		);
		status = 404;
		expect(espHome.read(device)).rejects.toThrow("no climate with that id");
		status = 500;
		expect(espHome.read(device)).rejects.toThrow("answered 500");
		(
			globalThis.fetch as unknown as {
				mockRejectedValue: (error: Error) => void;
			}
		).mockRejectedValue(new Error("offline"));
		expect(espHome.read(device)).rejects.toThrow("can't be reached");
		const bare = DeviceDTO.upsert({
			kind: "esphome-climate",
			homeId: homeId(),
			name: "Bare",
			externalId: "bare",
		});
		expect(espHome.read(bare)).rejects.toThrow("no address or climate id");
		expect(
			espHomeSchema.safeParse({
				name: "Office",
				host: "192.0.2.71",
				objectId: "Office Unit",
			}).success,
		).toBe(false);
	});
});
