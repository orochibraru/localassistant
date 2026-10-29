import { beforeEach, describe, expect, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { secrets } from "#lib/server/core/secrets.js";
import { broker } from "#lib/server/devices/broker.js";
import { shelly } from "#lib/server/devices/shelly.js";
import { energy } from "#lib/server/house/energy.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";

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

describe("Shelly", () => {
	test("reads relays, single meters and three-phase meters", () => {
		expect(
			shelly.readings("switch:0", { apower: 12.5, aenergy: { total: 1500 } }),
		).toEqual([{ channel: "switch:0", power: 12.5, energy: 1.5 }]);
		expect(shelly.readings("em1:1", { act_power: 900 })).toEqual([
			{ channel: "em1:1", power: 900 },
		]);
		expect(shelly.readings("em1data:1", { total_act_energy: 2000 })).toEqual([
			{ channel: "em1:1", energy: 2 },
		]);
		expect(
			shelly.readings("em:0", {
				a_act_power: 1,
				b_act_power: 2,
				c_act_power: 3,
			}),
		).toHaveLength(3);
		expect(
			shelly.readings("emdata:0", { a_total_act_energy: 1000 })[0],
		).toEqual({
			channel: "em:0:a",
			energy: 1,
		});
		expect(shelly.readings("sys", {})).toEqual([]);
		expect(shelly.readings("input:0", {})).toEqual([]);
	});

	test("the broker brings each channel in as a meter", async () => {
		resetDatabase();
		const settings = {
			url: "mqtt://broker.local:1883",
			username: null,
			encryptedPassword: secrets.encrypt("x"),
			zigbeeTopic: "zigbee2mqtt",
			homeId: homeId(),
		};
		await broker.handle(
			settings,
			"shellyem-1/status/em1:0",
			JSON.stringify({ act_power: 2400 }),
		);
		await broker.handle(
			settings,
			"shellyem-1/status/em1data:0",
			JSON.stringify({ total_act_energy: 5000 }),
		);
		await broker.handle(settings, "shellyem-1/events/rpc", "{}");
		await broker.handle(settings, "shellyem-1/status/em1:0", "nope");
		broker.flush();
		const [device] = DeviceDTO.inHome(homeId());
		expect(device?.kind).toBe("shelly-meter");
		expect(device?.externalId).toBe("shellyem-1/em1:0");
		expect(device?.state).toEqual({ type: "meter", power: 2400, energy: 5 });
		await devices();
	});
});

async function devices() {
	const { devices: service } = await import("#lib/server/devices/devices.js");
	await service.refresh(DeviceDTO.inHome(homeId())[0] as DeviceDTO);
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
		const overview = energy.overview(homeId(), "Europe/Paris", now);
		expect(overview.house.metered).toBe(true);
		expect(overview.house.days).toHaveLength(30);
		expect(overview.house.days.at(-1)).toEqual({
			key: "2026-10-28",
			kilowattHours: 5,
		});
		expect(overview.house.days.at(-2)).toEqual({
			key: "2026-10-27",
			kilowattHours: 10,
		});
		expect(overview.house.months.at(-1)).toEqual({
			key: "2026-10",
			kilowattHours: 15,
		});
		expect(overview.house.months).toHaveLength(12);
		expect(overview.appliances.map((series) => series.name).toSorted()).toEqual(
			["Dryer", "Heat pump"],
		);
		expect(
			overview.appliances.find((series) => series.name === "Dryer")?.days.at(-1)
				?.kilowattHours,
		).toBe(3);

		linky.delete();
		const unmetered = energy.overview(homeId(), "Europe/Paris", now);
		expect(unmetered.house.metered).toBe(false);
		expect(unmetered.house.days.at(-1)?.kilowattHours).toBe(3);
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
		expect(energy.overview(homeId(), "UTC").appliances).toEqual([]);
	});
});
