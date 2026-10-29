import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";
import { linky } from "#lib/server/devices/linky.js";
import { energy } from "#lib/server/house/energy.js";
import { editLinkySchema, linkySchema } from "#lib/server/validation/device.js";

import { homeId, resetDatabase } from "../../database.js";

let answer: () => Response | Promise<Response>;
const urls: string[] = [];

function addLinky(withToken = true) {
	return DeviceDTO.upsert({
		kind: "linky",
		homeId: homeId(),
		name: "Linky",
		externalId: "12345678901234",
		encryptedLocalKey: withToken
			? secrets.encrypt("token-0123456789abcdef")
			: undefined,
	});
}

const daily = (values: [string, number | null][]) =>
	Response.json({
		idPrm: "12345678901234",
		grandeur: [
			{
				unite: "Wh",
				points: values.map(([d, value]) => ({
					d,
					v: value === null ? null : String(value),
				})),
			},
		],
	});

beforeEach(() => {
	resetDatabase();
	urls.length = 0;
	spyOn(globalThis, "fetch").mockImplementation((async (input: string) => {
		urls.push(input);
		return answer();
	}) as unknown as typeof fetch);
});

afterEach(() => {
	(globalThis.fetch as unknown as { mockRestore: () => void }).mockRestore();
});

describe("Linky online", () => {
	test("stores the daily use as a counter the energy charts read, and keeps the last for six hours", async () => {
		const meter = addLinky();
		const now = new Date("2026-10-28T10:00:00Z");
		answer = () =>
			daily([
				["2026-10-27", 12_500],
				["2026-10-26", 10_000],
				["2026-10-25", Number.NaN],
				["2026-10-24", null],
			]);
		await devices.refresh(meter);
		expect(urls[0]).toContain("/api/consommation_quotidienne?");
		expect(urls[0]).toContain("pointId=12345678901234");
		expect(DeviceDTO.find(meter.id)?.state).toEqual({
			type: "linky",
			day: "2026-10-27",
			kilowattHours: 12.5,
		});
		expect(
			EnergyReadingDTO.since([meter.id], new Date(0)).map(
				(reading) => reading.toJSON().total,
			),
		).toEqual([10, 22.5]);
		const report = energy.report(
			homeId(),
			"Europe/Paris",
			{ from: "2026-10-27", to: "2026-10-28" },
			now,
		);
		expect(report.house.metered).toBe(true);
		expect(report.house.total).toBe(12.5);

		answer = () => daily([["2026-10-28", 9000]]);
		const fresh = DeviceDTO.find(meter.id) as DeviceDTO;
		expect(await linky.read(fresh, new Date())).toMatchObject({
			day: "2026-10-27",
		});
		expect(
			await linky.read(fresh, new Date(Date.now() + 7 * 60 * 60_000)),
		).toMatchObject({ day: "2026-10-28" });
		expect(
			EnergyReadingDTO.since([meter.id], new Date(0)).at(-1)?.toJSON().total,
		).toBe(31.5);
		answer = () => daily([]);
		expect(
			await linky.read(fresh, new Date(Date.now() + 14 * 60 * 60_000)),
		).toEqual({ type: "linky", day: null, kilowattHours: null });
	});

	test("explains a refused token, an outage and a missing token", async () => {
		answer = () => new Response("", { status: 403 });
		expect(linky.read(addLinky())).rejects.toThrow("refused the token");
		answer = () => new Response("", { status: 500 });
		expect(linky.read(addLinky())).rejects.toThrow("answered 500");
		answer = () =>
			Response.json(
				{
					status: 400,
					message: "The Enedis API returned an error",
					error: {
						error: "ADAM-DC-0007",
						error_description:
							"Le client n'est pas titulaire du point demandé.",
					},
				},
				{ status: 400 },
			);
		expect(linky.read(addLinky())).rejects.toThrow(
			"Enedis says this account doesn't hold that PRM anymore",
		);
		answer = () =>
			Response.json(
				{ status: 400, message: "The Enedis API returned an error" },
				{ status: 400 },
			);
		expect(linky.read(addLinky())).rejects.toThrow(
			"conso.boris.sh answered 400: The Enedis API returned an error",
		);
		answer = () => Promise.reject(new Error("offline"));
		expect(linky.read(addLinky())).rejects.toThrow("can't be reached");
		resetDatabase();
		expect(linky.read(addLinky(false))).rejects.toThrow("no token");
	});

	test("another PRM or token reads the meter again at once, an empty token keeps the old one", () => {
		const meter = addLinky();
		meter.saveState({ type: "linky", day: "2026-10-27", kilowattHours: 12 });
		meter.relink({
			name: "Meter",
			roomId: null,
			externalId: "99999999999999",
		});
		const relinked = DeviceDTO.find(meter.id);
		expect(relinked?.toJSON()).toMatchObject({
			name: "Meter",
			externalId: "99999999999999",
			state: null,
			stateAt: null,
		});
		expect(relinked?.encryptedLocalKey()).not.toBeNull();
		expect(
			editLinkySchema.parse({
				id: meter.id,
				name: "Meter",
				externalId: "99999999999999",
				token: "",
			}).token,
		).toBeUndefined();
		expect(
			editLinkySchema.safeParse({
				id: meter.id,
				name: "Meter",
				externalId: "99999999999999",
				token: "short",
			}).success,
		).toBe(false);
	});

	test("the form wants a 14-digit PRM and a token", () => {
		expect(
			linkySchema.safeParse({
				externalId: "12345678901234",
				token: "t".repeat(30),
			}).success,
		).toBe(true);
		expect(
			linkySchema.safeParse({ externalId: "1234", token: "t".repeat(30) })
				.success,
		).toBe(false);
	});
});
