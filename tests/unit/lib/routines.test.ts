import { describe, expect, test } from "bun:test";

import {
	checksFor,
	describeCommand,
	describeCondition,
	describeTest,
	describeTrigger,
	measures,
	readingOf,
	testFires,
	testHolds,
	withinTimes,
} from "#lib/automations.js";
import type { DeviceState } from "#lib/devices.js";
import { captureCommand, startingCommand } from "#lib/scenes.js";

const name = () => "Lamp";
const light = (on: boolean | null, brightness: number | null = null) =>
	({
		type: "light",
		on,
		brightness,
		temperature: 2700,
		minTemperature: 2000,
		maxTemperature: 6500,
		color: null,
		features: ["brightness"],
	}) satisfies DeviceState;

describe("state tests", () => {
	test("know which checks a card can be watched for", () => {
		expect(checksFor("lock")).toEqual(["locked", "unlocked"]);
		expect(checksFor("button")).toEqual(["pressed"]);
		expect(checksFor("camera")).toEqual([]);
		expect(measures("above")).toBe(true);
		expect(measures("on")).toBe(false);
	});

	test("read the number each kind of state is compared on", () => {
		expect(
			readingOf({
				type: "sensor",
				readings: [
					{ name: "motion", value: true, unit: null },
					{ name: "temperature", value: 21.5, unit: "°C" },
				],
			}),
		).toBe(21.5);
		expect(readingOf({ type: "sensor", readings: [] })).toBeNull();
		expect(readingOf({ type: "meter", power: 900, energy: null })).toBe(900);
		expect(readingOf(light(true, 40))).toBe(40);
		expect(
			readingOf({
				type: "fan",
				on: true,
				speed: 30,
				speedSteps: 3,
				oscillating: null,
			}),
		).toBe(30);
		expect(readingOf({ type: "cover", position: 60 })).toBe(60);
		expect(
			readingOf({ type: "lock", locked: true, jammed: false, battery: 50 }),
		).toBeNull();
	});

	test("hold and fire on every check", () => {
		const on = { deviceId: "d", check: "on" as const, value: null };
		expect(testHolds(on, light(true))).toBe(true);
		expect(testHolds(on, null)).toBe(false);
		expect(testHolds({ ...on, check: "off" }, light(false))).toBe(true);
		expect(testFires(on, light(false), light(true))).toBe(true);
		expect(testFires(on, light(true), light(true))).toBe(false);
		expect(testFires(on, null, light(true))).toBe(true);
		const contact = (open: boolean) =>
			({ type: "contact", open, battery: null }) satisfies DeviceState;
		expect(testHolds({ ...on, check: "open" }, contact(true))).toBe(true);
		expect(
			testHolds({ ...on, check: "closed" }, { type: "cover", position: 0 }),
		).toBe(true);
		expect(
			testHolds({ ...on, check: "open" }, { type: "cover", position: null }),
		).toBe(false);
		const lock = (locked: boolean) =>
			({
				type: "lock",
				locked,
				jammed: false,
				battery: null,
			}) satisfies DeviceState;
		expect(testHolds({ ...on, check: "locked" }, lock(true))).toBe(true);
		expect(testHolds({ ...on, check: "unlocked" }, lock(false))).toBe(true);
		const media = {
			type: "media",
			power: true,
			playback: "playing",
			title: null,
			artist: null,
			volume: null,
			muted: null,
			source: null,
			sources: [],
		} satisfies DeviceState;
		expect(testHolds({ ...on, check: "playing" }, media)).toBe(true);
		expect(testHolds(on, media)).toBe(true);
		expect(
			testHolds(
				{ ...on, check: "above", value: 25 },
				{
					type: "climate",
					power: true,
					mode: "heat",
					modes: [],
					targetTemperature: 20,
					roomTemperature: 26,
					minTemperature: 10,
					maxTemperature: 30,
					offline: false,
				},
			),
		).toBe(true);
		expect(
			testHolds(
				{ ...on, check: "below", value: 100 },
				{ type: "switch", on: true, power: 50, energy: null },
			),
		).toBe(true);
		expect(
			testHolds(
				{ ...on, check: "on" },
				{
					type: "sensor",
					readings: [{ name: "motion", value: true, unit: null }],
				},
			),
		).toBe(true);
		const pressed = { ...on, check: "pressed" as const };
		const button = (pressedAt: string | null) =>
			({ type: "button", pressedAt }) satisfies DeviceState;
		expect(testHolds(pressed, button("2026-01-01T00:00:00Z"))).toBe(false);
		expect(
			testFires(pressed, button(null), button("2026-01-01T00:00:00Z")),
		).toBe(true);
		expect(
			testFires(
				pressed,
				button("2026-01-01T00:00:00Z"),
				button("2026-01-01T00:00:00Z"),
			),
		).toBe(false);
		expect(testFires(pressed, null, light(true))).toBe(false);
	});

	test("say what they watch for, as it fires or as it holds", () => {
		const test = { deviceId: "d", check: "above" as const, value: 25 };
		expect(describeTest(test, name)).toBe("Lamp goes above 25");
		expect(describeTest({ ...test, check: "on" }, name, true)).toBe(
			"Lamp is on",
		);
		expect(
			describeTrigger(
				{ type: "device", test: { ...test, check: "pressed" } },
				name,
			),
		).toBe("When Lamp is pressed");
		expect(
			describeTrigger({ type: "device", test: { ...test, check: "on" } }),
		).toBe("When a device turns on");
	});
});

describe("conditions", () => {
	test("windows of time wrap over midnight", () => {
		expect(withinTimes("23:00", "22:00", "06:00")).toBe(true);
		expect(withinTimes("05:59", "22:00", "06:00")).toBe(true);
		expect(withinTimes("06:00", "22:00", "06:00")).toBe(false);
		expect(withinTimes("12:00", "09:00", "17:00")).toBe(true);
		expect(withinTimes("17:00", "09:00", "17:00")).toBe(false);
	});

	test("read as words", () => {
		expect(
			describeCondition(
				{
					type: "device",
					test: { deviceId: "d", check: "locked", value: null },
				},
				name,
			),
		).toBe("Lamp is locked");
		expect(
			describeCondition({ type: "time", from: "22:00", to: "06:00" }, name),
		).toBe("Between 22:00 and 06:00");
		expect(
			describeCondition({ type: "weekdays", weekdays: [5, 6] }, name),
		).toBe("At weekends");
		expect(describeCondition({ type: "sun", when: "day" }, name)).toBe(
			"During the day",
		);
		expect(describeCondition({ type: "sun", when: "night" }, name)).toBe(
			"At night",
		);
	});
});

describe("device commands", () => {
	test("read as words for every kind of device", () => {
		const said = (command: Parameters<typeof describeCommand>[0]) =>
			describeCommand(command, "It");
		expect(said({ type: "cover", move: { position: 40 } })).toBe(
			"Move It to 40% open",
		);
		expect(said({ type: "cover", move: { action: "stop" } })).toBe("Stop It");
		expect(said({ type: "cover", move: { action: "open" } })).toBe("Open It");
		expect(said({ type: "cover", move: { action: "close" } })).toBe("Close It");
		expect(said({ type: "climate", change: { targetTemperature: 19 } })).toBe(
			"Set It at 19°C",
		);
		expect(said({ type: "switch", on: true })).toBe("Turn It on");
		expect(said({ type: "valve", target: 18 })).toBe("Set It to 18°C");
		expect(
			said({
				type: "light",
				change: {
					on: true,
					brightness: 40,
					temperature: 2700,
					color: { hue: 1, saturation: 2 },
				},
			}),
		).toBe("Turn It on at 40% 2700 K in colour");
		expect(said({ type: "light", change: { on: false } })).toBe("Turn It off");
		expect(said({ type: "lock", locked: true })).toBe("Lock It");
		expect(said({ type: "lock", locked: false })).toBe("Unlock It");
		expect(
			said({
				type: "fan",
				change: { on: true, speed: 30, oscillating: true },
			}),
		).toBe("Turn It on at 30% oscillating");
		expect(said({ type: "fan", change: { oscillating: false } })).toBe(
			"Set It still",
		);
		expect(said({ type: "media", change: { action: "next" } })).toBe(
			"Skip to the next track on It",
		);
		expect(said({ type: "media", change: { action: "stop" } })).toBe("Stop It");
		expect(
			said({
				type: "media",
				change: { power: true, volume: 20, source: "TV" },
			}),
		).toBe("Turn It on at volume 20 on TV");
		expect(said({ type: "button" })).toBe("Press It");
		expect(said({ type: "printer", change: { command: "pause" } })).toBe(
			"Pause It",
		);
		expect(said({ type: "printer", change: { light: true } })).toBe("Set It");
	});

	test("scenes capture what a device is doing now", () => {
		expect(captureCommand(null)).toBeNull();
		expect(
			captureCommand({ type: "switch", on: true, power: null, energy: null }),
		).toEqual({ type: "switch", on: true });
		expect(
			captureCommand({ type: "switch", on: null, power: null, energy: null }),
		).toBeNull();
		expect(captureCommand(light(true, 60))).toEqual({
			type: "light",
			change: { on: true, brightness: 60, temperature: 2700 },
		});
		expect(
			captureCommand({ ...light(true), color: { hue: 5, saturation: 6 } }),
		).toEqual({
			type: "light",
			change: { on: true, color: { hue: 5, saturation: 6 } },
		});
		expect(captureCommand(light(false))).toEqual({
			type: "light",
			change: { on: false },
		});
		expect(captureCommand(light(null))).toBeNull();
		expect(captureCommand({ type: "cover", position: 30 })).toEqual({
			type: "cover",
			move: { position: 30 },
		});
		expect(captureCommand({ type: "cover", position: null })).toBeNull();
		expect(
			captureCommand({
				type: "climate",
				power: true,
				mode: "heat",
				modes: [],
				targetTemperature: 21,
				roomTemperature: 20,
				minTemperature: 10,
				maxTemperature: 30,
				offline: false,
			}),
		).toEqual({
			type: "climate",
			change: { power: true, mode: "heat", targetTemperature: 21 },
		});
		expect(
			captureCommand({
				type: "climate",
				power: false,
				mode: null,
				modes: [],
				targetTemperature: null,
				roomTemperature: null,
				minTemperature: 10,
				maxTemperature: 30,
				offline: false,
			}),
		).toEqual({ type: "climate", change: { power: false } });
		const valve = {
			type: "valve",
			target: 19,
			temperature: null,
			battery: null,
			setpoint: "x",
			min: 5,
			max: 30,
			heldBy: null,
			heldTarget: null,
		} satisfies DeviceState;
		expect(captureCommand(valve)).toEqual({ type: "valve", target: 19 });
		expect(captureCommand({ ...valve, target: null })).toBeNull();
		const fan = {
			type: "fan",
			on: true,
			speed: 40,
			speedSteps: 3,
			oscillating: null,
		} satisfies DeviceState;
		expect(captureCommand(fan)).toEqual({
			type: "fan",
			change: { on: true, speed: 40 },
		});
		expect(captureCommand({ ...fan, on: null })).toBeNull();
		expect(
			captureCommand({
				type: "lock",
				locked: true,
				jammed: false,
				battery: null,
			}),
		).toEqual({ type: "lock", locked: true });
		expect(
			captureCommand({
				type: "lock",
				locked: null,
				jammed: false,
				battery: null,
			}),
		).toBeNull();
		const media = {
			type: "media",
			power: true,
			playback: null,
			title: null,
			artist: null,
			volume: 30,
			muted: null,
			source: null,
			sources: [],
		} satisfies DeviceState;
		expect(captureCommand(media)).toEqual({
			type: "media",
			change: { power: true, volume: 30 },
		});
		expect(captureCommand({ ...media, power: null })).toBeNull();
		expect(captureCommand({ type: "button", pressedAt: null })).toBeNull();
		expect(startingCommand("lock")).toEqual({ type: "lock", locked: true });
		expect(startingCommand("camera")).toBeNull();
	});
});
