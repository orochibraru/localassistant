import { beforeEach, describe, expect, test } from "bun:test";

import type { DeviceState } from "#lib/devices.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceSampleDTO } from "#lib/dto/device-sample.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { LogbookEntryDTO } from "#lib/dto/logbook-entry.js";
import { PresenceDTO } from "#lib/dto/presence.js";
import { bucketed, describeChange, readingUnit } from "#lib/history.js";
import { automations } from "#lib/server/automations/automations.js";
import { history } from "#lib/server/house/history.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";

import { createUser, homeId, resetDatabase } from "../../database.js";

const meter = (power: number) =>
	({ type: "meter", power, energy: null }) satisfies DeviceState;
const plug = (on: boolean | null) =>
	({ type: "switch", on, power: null, energy: null }) satisfies DeviceState;

describe("history words and numbers", () => {
	test("describe what changed on every kind of device", () => {
		expect(describeChange(plug(false), plug(true))).toBe("turned on");
		expect(describeChange(plug(true), plug(false))).toBe("turned off");
		expect(describeChange(plug(true), plug(true))).toBeNull();
		expect(describeChange(null, plug(true))).toBeNull();
		expect(describeChange(plug(true), plug(null))).toBeNull();
		const climate = (power: boolean) =>
			({
				type: "climate",
				power,
				mode: null,
				modes: [],
				targetTemperature: null,
				roomTemperature: null,
				minTemperature: 10,
				maxTemperature: 30,
				offline: false,
			}) satisfies DeviceState;
		expect(describeChange(climate(false), climate(true))).toBe("turned on");
		const contact = (open: boolean) =>
			({ type: "contact", open, battery: null }) satisfies DeviceState;
		expect(describeChange(contact(false), contact(true))).toBe("opened");
		expect(describeChange(contact(true), contact(false))).toBe("shut");
		const lock = (locked: boolean, jammed = false) =>
			({ type: "lock", locked, jammed, battery: null }) satisfies DeviceState;
		expect(describeChange(lock(false), lock(true))).toBe("locked");
		expect(describeChange(lock(true), lock(true, true))).toBe("is jammed");
		const media = (power: boolean, playback: "playing" | "paused" | "idle") =>
			({
				type: "media",
				power,
				playback,
				title: null,
				artist: null,
				volume: null,
				muted: null,
				source: null,
				sources: [],
			}) satisfies DeviceState;
		expect(describeChange(media(true, "idle"), media(true, "playing"))).toBe(
			"started playing",
		);
		expect(describeChange(media(true, "playing"), media(true, "paused"))).toBe(
			"paused",
		);
		expect(describeChange(media(true, "paused"), media(true, "idle"))).toBe(
			"stopped",
		);
		expect(describeChange(media(true, "idle"), media(false, "idle"))).toBe(
			"turned off",
		);
		const button = (pressedAt: string | null) =>
			({ type: "button", pressedAt }) satisfies DeviceState;
		expect(describeChange(button(null), button("2026-01-01T00:00:00Z"))).toBe(
			"was pressed",
		);
		expect(describeChange(null, button("2026-01-01T00:00:00Z"))).toBeNull();
		const person = (home: boolean | null, zone: string | null = null) =>
			({ type: "presence", home, zone, battery: null }) satisfies DeviceState;
		expect(describeChange(person(false), person(true))).toBe("got home");
		expect(describeChange(person(true), person(false))).toBe("left");
		expect(describeChange(person(false), person(false, "Work"))).toBe(
			"is in Work",
		);
		expect(describeChange(null, person(true))).toBeNull();
		const vacuum = (stage: "cleaning" | "docked") =>
			({
				type: "vacuum",
				stage,
				battery: null,
			}) as unknown as DeviceState;
		expect(describeChange(vacuum("docked"), vacuum("cleaning"))).toBe(
			"is cleaning",
		);
		const printer = (stage: string) =>
			({ type: "printer", stage }) as unknown as DeviceState;
		expect(describeChange(printer("idle"), printer("printing"))).toBe(
			"is printing",
		);
		expect(describeChange(meter(1), meter(2))).toBeNull();
	});

	test("name the unit each kind's graph is in", () => {
		expect(readingUnit(meter(1))).toBe("W");
		expect(readingUnit({ type: "cover", position: 1 })).toBe("%");
		expect(
			readingUnit({
				type: "sensor",
				readings: [{ name: "co2", value: 400, unit: "ppm" }],
			}),
		).toBe("ppm");
		expect(readingUnit({ type: "sensor", readings: [] })).toBe("");
		expect(readingUnit(null)).toBe("");
		expect(
			readingUnit({
				type: "valve",
				target: null,
				temperature: null,
				battery: null,
				setpoint: "x",
				min: 5,
				max: 30,
				heldBy: null,
				heldTarget: null,
			}),
		).toBe("°C");
	});

	test("average many points down into slices of time", () => {
		const from = new Date("2026-01-01T00:00:00Z");
		const to = new Date("2026-01-01T04:00:00Z");
		const points = [0, 1, 2, 3].flatMap((hour) => [
			{ at: new Date(from.getTime() + hour * 3_600_000), value: hour },
			{
				at: new Date(from.getTime() + hour * 3_600_000 + 60_000),
				value: hour + 1,
			},
		]);
		expect(bucketed(points, from, to, 100)).toBe(points);
		expect(bucketed(points, from, to, 4)).toEqual([
			{ at: new Date("2026-01-01T00:30:00Z"), value: 0.5 },
			{ at: new Date("2026-01-01T01:30:00Z"), value: 1.5 },
			{ at: new Date("2026-01-01T02:30:00Z"), value: 2.5 },
			{ at: new Date("2026-01-01T03:30:00Z"), value: 3.5 },
		]);
	});
});

describe("history and logbook", () => {
	beforeEach(resetDatabase);

	test("samples at most once a minute and writes what changed to the logbook", () => {
		const power = DeviceDTO.upsert({
			kind: "shelly-meter",
			homeId: homeId(),
			name: "Dryer",
			externalId: "dryer",
		});
		const start = Date.now() - 3_600_000;
		history.record(power, null, meter(100), start);
		history.record(power, meter(100), meter(200), start + 10_000);
		history.record(power, meter(200), meter(200), start + 120_000);
		history.record(power, meter(200), meter(300), start + 180_000);
		history.record(power, meter(300), meter(300), start + 20 * 60_000);
		expect(
			DeviceSampleDTO.since(power.id, new Date(start - 1)).map(
				(point) => point.value,
			),
		).toEqual([100, 200, 300, 300]);
		expect(history.series(power.id, "day")).toHaveLength(4);

		const lamp = DeviceDTO.upsert({
			kind: "mqtt-discovery-switch",
			homeId: homeId(),
			name: "Lamp",
			externalId: "lamp",
		});
		history.record(lamp, plug(false), plug(true));
		history.record(lamp, plug(true), plug(true));
		expect(LogbookEntryDTO.forDevice(lamp.id)).toMatchObject([
			{ name: "Lamp", message: "turned on", deviceId: lamp.id },
		]);
		expect(LogbookEntryDTO.recent(homeId())).toHaveLength(1);
	});

	test("routine runs and comings and goings go to the logbook, and old lines are pruned", async () => {
		const ada = createUser("ada", "Ada").id;
		const routine = AutomationDTO.create(homeId(), {
			name: "Night",
			trigger: { type: "sun", event: "sunset", offsetMinutes: 0 },
			period: { type: "always" },
			conditions: [],
			actions: [
				{ type: "blinds", roomId: null, move: "close", position: null },
			],
		});
		await automations.run(routine, "Run by hand");
		const watch = DeviceDTO.upsert({
			kind: "home-assistant-presence",
			homeId: homeId(),
			name: "Watch",
			externalId: "person.ada",
		});
		watch.setOwner(ada);
		watch.saveState({
			type: "presence",
			home: true,
			zone: null,
			battery: null,
		});
		await jobHandlers["presence.update"]({ userId: ada });
		expect(PresenceDTO.find(ada)?.home).toBe(true);
		const lines = LogbookEntryDTO.recent(homeId());
		expect(lines.map((line) => `${line.name} ${line.message}`)).toEqual([
			"Ada got home",
			"Night failed: No blind to move.",
		]);
		const older = LogbookEntryDTO.recent(homeId(), 100, lines[0]?.id);
		expect(older).toHaveLength(1);
		LogbookEntryDTO.add({
			homeId: null,
			name: "Old",
			message: "happened",
			at: new Date("2020-01-01T00:00:00Z"),
		});
		DeviceSampleDTO.record(watch.id, 1, new Date("2020-01-01T00:00:00Z"));
		jobHandlers["jobs.prune"]({ olderThanDays: 1 });
		expect(LogbookEntryDTO.recent(homeId())).toHaveLength(2);
		expect(DeviceSampleDTO.since(watch.id, new Date(0))).toEqual([]);
	});
});
