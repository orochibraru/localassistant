import { beforeEach, describe, expect, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { bucketLabel, monthName, rangeLabel } from "#lib/energy.js";
import { energy, type EnergyChoice } from "#lib/server/house/energy.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";
import { energyRangeSchema } from "#lib/server/validation/energy.js";

import { homeId, resetDatabase } from "../../database.js";

const hourMs = 60 * 60_000;

function meter(
	kind: "zigbee-meter" | "shelly-meter" | "zigbee-switch",
	name: string,
) {
	const device = DeviceDTO.upsert({
		kind,
		homeId: homeId(),
		name,
		externalId: name,
	});
	device.saveState(
		kind === "zigbee-switch"
			? { type: "switch", on: true, power: null, energy: 0 }
			: { type: "meter", power: null, energy: 0 },
	);
	return device;
}

describe("energy", () => {
	beforeEach(resetDatabase);

	test("snapshots counters and sums them into days and months, skipping resets", () => {
		const now = new Date("2026-10-28T12:30:00Z");
		const linky = meter("zigbee-meter", "Linky");
		const dryer = meter("zigbee-switch", "Dryer");
		meter("shelly-meter", "Heat pump");
		DeviceDTO.upsert({
			kind: "tuya-cover",
			homeId: homeId(),
			name: "Blind",
			externalId: "b",
		});
		const at = (iso: string) => new Date(iso);
		for (const [iso, total] of [
			["2026-10-26T22:00:00Z", 100],
			["2026-10-27T10:00:00Z", 104],
			["2026-10-27T21:00:00Z", 110],
			["2026-10-28T08:00:00Z", 3],
			["2026-10-28T11:00:00Z", 8],
		] as const) {
			EnergyReadingDTO.record(linky.id, at(iso), total);
		}
		EnergyReadingDTO.record(dryer.id, at("2026-10-28T09:00:00Z"), 1);
		EnergyReadingDTO.record(dryer.id, at("2026-10-28T10:00:00Z"), 3.5);
		EnergyReadingDTO.record(dryer.id, at("2026-10-28T10:00:00Z"), 4);
		const days = energy.report(
			homeId(),
			"Europe/Paris",
			{ from: "2026-09-29", to: "2026-10-28" },
			now,
		);
		expect(days.range).toEqual({
			key: "custom",
			from: "2026-09-29",
			to: "2026-10-28",
			unit: "day",
		});
		expect(days.house.metered).toBe(true);
		expect(days.house.buckets).toHaveLength(30);
		expect(days.house.buckets.at(-1)).toEqual({
			key: "2026-10-28",
			kilowattHours: 5,
		});
		expect(days.house.buckets.at(-2)).toEqual({
			key: "2026-10-27",
			kilowattHours: 10,
		});
		expect(days.house).toMatchObject({
			total: 15,
			averagePerDay: 0.5,
			peak: { key: "2026-10-27", kilowattHours: 10 },
			lowest: { kilowattHours: 0 },
			projection: null,
		});
		expect(days.months).toEqual(["2026-10"]);
		expect(days.profile.cumulative).toHaveLength(30);
		expect(days.profile.cumulative.at(-1)).toEqual({
			day: "2026-10-28",
			current: 15,
			previous: 0,
		});
		expect(days.profile.weekdays).toHaveLength(7);
		expect(days.profile.weekdays[1]).toBeCloseTo(10 / 5, 1);
		expect(days.profile.hours).toHaveLength(24);
		expect(
			(days.profile.hours ?? []).reduce((sum, value) => sum + value, 0) * 30,
		).toBeCloseTo(15, 0);
		const year = energy.report(
			homeId(),
			"Europe/Paris",
			{ preset: "year-to-date" },
			now,
		);
		expect(year.house.buckets.at(-1)).toEqual({
			key: "2026-10",
			kilowattHours: 15,
		});
		expect(year.house.buckets).toHaveLength(10);
		expect(
			days.appliances.map((appliance) => appliance.name).toSorted(),
		).toEqual(["Dryer", "Heat pump"]);
		const dryerUse = days.appliances.find(
			(appliance) => appliance.name === "Dryer",
		);
		expect(dryerUse?.buckets.at(-1)?.kilowattHours).toBe(3);
		expect(dryerUse?.share).toBe(0.2);
		const hours = energy.report(
			homeId(),
			"Europe/Paris",
			{ preset: "today" },
			now,
		);
		expect(hours.range.unit).toBe("hour");
		expect(hours.house.buckets).toHaveLength(24);
		expect(
			hours.house.buckets.find((bucket) => bucket.key === "2026-10-28 12"),
		).toEqual({ key: "2026-10-28 12", kilowattHours: 5 });
		const week = energy.report(
			homeId(),
			"Europe/Paris",
			{ preset: "this-month" },
			now,
		);
		expect(week.house.projection).toBe(16.61);
		expect(week.house.previousTotal).toBe(0);

		linky.delete();
		const unmetered = energy.report(
			homeId(),
			"Europe/Paris",
			{ from: "2026-10-28", to: "2026-10-28" },
			now,
		);
		expect(unmetered.house.metered).toBe(false);
		expect(unmetered.house.total).toBe(3);
		expect(
			energy.bucketOf(at("2026-10-27T23:30:00Z"), "Europe/Paris", "day"),
		).toBe("2026-10-28");
		expect(EnergyReadingDTO.since([], now)).toEqual([]);
	});

	test("records every metered device each hour and prunes old snapshots", async () => {
		const linky = meter("zigbee-meter", "Linky");
		linky.saveState({ type: "meter", power: 900, energy: 42 });
		meter("zigbee-switch", "Lamp").saveState({
			type: "switch",
			on: false,
			power: null,
			energy: null,
		});
		expect(energy.record(new Date("2026-10-28T12:40:00Z"))).toBe(1);
		expect(
			EnergyReadingDTO.since([linky.id], new Date(0)).map((reading) =>
				reading.toJSON(),
			),
		).toEqual([
			{ deviceId: linky.id, hour: new Date("2026-10-28T12:00:00Z"), total: 42 },
		]);
		EnergyReadingDTO.record(
			linky.id,
			new Date(Date.now() - 900 * 24 * hourMs),
			1,
		);
		await jobHandlers["energy.record"]({});
		await jobHandlers["jobs.prune"]({ olderThanDays: 1 });
		expect(EnergyReadingDTO.since([linky.id], new Date(0))).toHaveLength(2);
		expect(
			energy.report(homeId(), "UTC", { preset: "this-month" }).appliances,
		).toEqual([]);
	});

	test("every preset and a month cover the days they say", () => {
		const today = "2026-10-29";
		const cases: [EnergyChoice, [string, string, string]][] = [
			[{ preset: "today" }, [today, today, "hour"]],
			[{ preset: "yesterday" }, ["2026-10-28", "2026-10-28", "hour"]],
			[{ preset: "last-3-days" }, ["2026-10-27", today, "hour"]],
			[{ preset: "this-week" }, ["2026-10-26", today, "day"]],
			[{ preset: "this-month" }, ["2026-10-01", "2026-10-31", "day"]],
			[{ preset: "last-month" }, ["2026-09-01", "2026-09-30", "day"]],
			[{ preset: "last-3-months" }, ["2026-08-01", today, "day"]],
			[{ preset: "this-year" }, ["2026-01-01", "2026-12-31", "month"]],
			[{ preset: "year-to-date" }, ["2026-01-01", today, "month"]],
			[{ preset: "all-time" }, ["2025-03-04", today, "month"]],
			[{ month: "2026-02" }, ["2026-02-01", "2026-02-28", "day"]],
			[{ season: "spring" }, ["2026-03-01", "2026-05-31", "day"]],
			[{ season: "autumn" }, ["2026-09-01", "2026-11-30", "day"]],
			[{ season: "winter" }, ["2025-12-01", "2026-02-28", "day"]],
			[
				{ from: "2026-10-20", to: "2026-10-01" },
				["2026-10-01", "2026-10-20", "day"],
			],
			[{ from: "2025-01-01", to: today }, ["2025-01-01", today, "month"]],
		];
		for (const [choice, [from, to, unit]] of cases) {
			expect(energy.resolve(choice, today, "2025-03-04")).toMatchObject({
				from,
				to,
				unit,
			});
		}
		expect(energy.resolve({ preset: "all-time" }, today, null).from).toBe(
			today,
		);
	});

	test("the period query falls back to this month when it makes no sense", () => {
		expect(energyRangeSchema.parse({ range: "last-month" })).toEqual({
			preset: "last-month",
		});
		expect(energyRangeSchema.parse({ range: "month:2026-02" })).toEqual({
			month: "2026-02",
		});
		expect(
			energyRangeSchema.parse({ from: "2026-10-01", to: "2026-10-05" }),
		).toEqual({ from: "2026-10-01", to: "2026-10-05" });
		expect(energyRangeSchema.parse({ range: "season:winter" })).toEqual({
			season: "winter",
		});
		expect(energyRangeSchema.parse({ range: "forever" })).toEqual({
			preset: "this-month",
		});
		expect(energyRangeSchema.safeParse({ from: "yesterday" }).success).toBe(
			false,
		);
	});

	test("bars are labelled by hour, day or month", () => {
		expect(bucketLabel("2026-10-28 14", "hour")).toBe("14h");
		expect(bucketLabel("2026-10-28", "day")).toBe("28/10");
		expect(bucketLabel("2026-10", "month")).toMatch(/26/);
		expect(monthName("2026-09")).toMatch(/2026/);
		expect(
			rangeLabel({
				key: "season:winter",
				from: "2025-12-01",
				to: "2026-02-28",
				unit: "day",
			}),
		).toBe("Winter 2025–26");
		expect(
			rangeLabel({
				key: "season:summer",
				from: "2026-06-01",
				to: "2026-08-31",
				unit: "day",
			}),
		).toBe("Summer 2026");
		expect(
			rangeLabel({ key: "this-week", from: "", to: "", unit: "day" }),
		).toBe("This week");
		expect(
			rangeLabel({
				key: "month:2026-09",
				from: "2026-09-01",
				to: "2026-09-30",
				unit: "day",
			}),
		).toMatch(/2026/);
		expect(
			rangeLabel({
				key: "custom",
				from: "2026-10-01",
				to: "2026-10-05",
				unit: "day",
			}),
		).toContain(" to ");
	});
});
