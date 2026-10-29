import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import {
	describeAction,
	describePeriod,
	describeTrigger,
	describeWeekdays,
	inPeriod,
	presetKeys,
	presets,
	seasonOf,
} from "#lib/automations.js";
import {
	type AutomationDefinition,
	AutomationDTO,
} from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import type { DeviceCommand } from "#lib/plugin-sdk.js";
import { automations } from "#lib/server/automations/automations.js";
import { devices } from "#lib/server/devices/devices.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";
import {
	automationFormSchema,
	automationSchema,
} from "#lib/server/validation/automation.js";
import type { Weather } from "#lib/weather.js";

import { resetDatabase } from "../../database.js";

function weather(temperature: number): Weather {
	return {
		temperature,
		feelsLike: null,
		code: 0,
		isDay: true,
		windSpeed: null,
		days: [
			{
				date: "2026-12-15",
				code: 0,
				min: 0,
				max: 5,
				sunrise: "2026-12-15T07:30:00.000Z",
				sunset: "2026-12-15T16:00:00.000Z",
			},
		],
	};
}

function parisHome(): HomeDTO {
	const home = HomeDTO.first();
	home.locate({
		place: "Clermont-Ferrand, France",
		latitude: 45.77,
		longitude: 3.08,
		timezone: "Europe/Paris",
	});
	home.saveWeather(weather(10));
	return home;
}

function make(home: HomeDTO, definition: Partial<AutomationDefinition>) {
	return AutomationDTO.create(home.id, {
		name: "Test",
		trigger: { type: "sun", event: "sunset", offsetMinutes: 0 },
		period: { type: "always" },
		conditions: [],
		actions: [{ type: "blinds", roomId: null, move: "close", position: null }],
		...definition,
	});
}

const at = (iso: string) => new Date(iso);

describe("automation helpers", () => {
	test("seasons, date ranges and words", () => {
		expect(seasonOf(1)).toBe("winter");
		expect(seasonOf(7)).toBe("summer");
		expect(seasonOf(10)).toBe("autumn");
		expect(inPeriod({ type: "seasons", seasons: ["winter"] }, "12-20")).toBe(
			true,
		);
		expect(inPeriod({ type: "seasons", seasons: ["summer"] }, "12-20")).toBe(
			false,
		);
		expect(
			inPeriod({ type: "dates", from: "11-15", to: "02-15" }, "01-10"),
		).toBe(true);
		expect(
			inPeriod({ type: "dates", from: "06-01", to: "08-31" }, "09-01"),
		).toBe(false);
		expect(inPeriod({ type: "always" }, "01-01")).toBe(true);
		expect(describeWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe("every day");
		expect(describeWeekdays([4, 0, 1, 2, 3])).toBe("on weekdays");
		expect(describeWeekdays([5, 6])).toBe("at weekends");
		expect(describeWeekdays([0, 2])).toBe("on Mon, Wed");
		expect(
			describeTrigger({ type: "sun", event: "sunset", offsetMinutes: 0 }),
		).toBe("At sunset");
		expect(
			describeTrigger({ type: "sun", event: "sunrise", offsetMinutes: -15 }),
		).toBe("15 min before sunrise");
		expect(
			describeTrigger({ type: "time", time: "21:00", weekdays: [5, 6] }),
		).toBe("At 21:00 at weekends");
		expect(
			describeTrigger({
				type: "temperature",
				direction: "above",
				threshold: 28,
			}),
		).toBe("When it gets above 28°C outside");
		expect(describeTrigger({ type: "contact", deviceIds: ["window"] })).toBe(
			"When a door or window opens",
		);
		expect(
			describeTrigger({ type: "contact", deviceIds: ["window", "door"] }),
		).toBe("When one of 2 doors or windows opens");
		expect(describePeriod({ type: "always" })).toBe("All year");
		expect(describePeriod({ type: "seasons", seasons: ["summer"] })).toBe(
			"In summer",
		);
		expect(describePeriod({ type: "dates", from: "06-15", to: "08-31" })).toBe(
			"From 15/06 to 31/08",
		);
		const names = {
			devices: new Map([["pump", "Living room"]]),
			rooms: new Map([["room", "Bedroom"]]),
		};
		expect(
			describeAction(
				{ type: "blinds", roomId: null, move: "close", position: null },
				names,
			),
		).toBe("Close every blind");
		expect(
			describeAction({ type: "valves", deviceIds: ["radiator"] }, names),
		).toBe("Close 1 radiator valve in its room until it shuts");
		expect(
			describeAction(
				{ type: "blinds", roomId: "room", move: "position", position: 30 },
				names,
			),
		).toBe("Move the blinds in Bedroom to 30% open");
		expect(
			describeAction(
				{ type: "blinds", roomId: "room", move: "open", position: null },
				names,
			),
		).toBe("Open the blinds in Bedroom");
		expect(
			describeAction(
				{
					type: "device",
					deviceId: "pump",
					command: {
						type: "climate",
						change: { power: true, mode: "heat", targetTemperature: 20 },
					},
				},
				names,
			),
		).toBe("Turn Living room on in heat mode at 20°C");
		expect(
			describeAction(
				{
					type: "device",
					deviceId: "gone",
					command: { type: "climate", change: { power: false } },
				},
				names,
			),
		).toBe("Turn a removed device off");
		expect(
			describeAction(
				{
					type: "device",
					deviceId: "pump",
					command: { type: "vacuum", change: { command: "dock" } },
				},
				names,
			),
		).toBe("Dock Living room");
		expect(describeAction({ type: "delay", minutes: 5 }, names)).toBe(
			"Wait 5 min",
		);
		expect(describeAction({ type: "scene", sceneId: "x" }, names)).toBe(
			"Set the scene that was removed",
		);
		expect(
			describeAction(
				{ type: "scene", sceneId: "x" },
				{ ...names, scenes: new Map([["x", "Movie night"]]) },
			),
		).toBe("Set the scene Movie night");
	});
});

describe("automations", () => {
	beforeEach(resetDatabase);

	test("a time on chosen weekdays fires once, in the home's time zone", () => {
		const home = parisHome();
		const automation = make(home, {
			trigger: { type: "time", time: "21:00", weekdays: [1] },
		});
		const tuesday = (time: string) => at(`2026-12-15T${time}Z`);
		expect(
			automations.check(
				automation,
				home,
				tuesday("19:59:00"),
				tuesday("20:00:00"),
			).due,
		).toBe(true);
		expect(
			automations.check(
				automation,
				home,
				tuesday("20:00:00"),
				tuesday("20:01:00"),
			).due,
		).toBe(false);
		const wednesday = at("2026-12-16T20:00:00Z");
		expect(
			automations.check(
				automation,
				home,
				new Date(wednesday.getTime() - 60_000),
				wednesday,
			).due,
		).toBe(false);
		const summer = at("2026-07-14T19:00:00Z");
		expect(
			automations.check(
				make(home, { trigger: { type: "time", time: "21:00", weekdays: [1] } }),
				home,
				new Date(summer.getTime() - 60_000),
				summer,
			).due,
		).toBe(true);
	});

	test("sunrise and sunset with an offset, only in the chosen season", () => {
		const home = parisHome();
		const sunset = make(home, {
			trigger: { type: "sun", event: "sunset", offsetMinutes: 10 },
			period: { type: "seasons", seasons: ["winter"] },
		});
		expect(
			automations.check(
				sunset,
				home,
				at("2026-12-15T16:09:00Z"),
				at("2026-12-15T16:10:00Z"),
			).due,
		).toBe(true);
		const summerOnly = make(home, {
			period: { type: "seasons", seasons: ["summer"] },
		});
		expect(
			automations.check(
				summerOnly,
				home,
				at("2026-12-15T15:59:00Z"),
				at("2026-12-15T16:00:00Z"),
			).due,
		).toBe(false);
	});

	test("the outside temperature fires on crossing, not while it stays past", () => {
		const home = parisHome();
		const hot = make(home, {
			trigger: { type: "temperature", direction: "above", threshold: 28 },
		});
		const step = (temperature: number) => {
			home.saveWeather(weather(temperature));
			const check = automations.check(
				hot,
				home,
				at("2026-07-01T12:00:00Z"),
				at("2026-07-01T12:01:00Z"),
			);
			hot.recordCheck(at("2026-07-01T12:01:00Z"), check.memory);
			return check.due;
		};
		expect(step(30)).toBe(false);
		expect(step(25)).toBe(false);
		expect(step(28)).toBe(true);
		expect(step(27.5)).toBe(false);
		expect(step(29)).toBe(false);
		expect(step(26)).toBe(false);
		expect(step(28.5)).toBe(true);
		const cold = make(home, {
			trigger: { type: "temperature", direction: "below", threshold: 5 },
		});
		home.saveWeather(weather(8));
		cold.recordCheck(
			at("2026-07-01T12:00:00Z"),
			automations.check(
				cold,
				home,
				at("2026-07-01T11:59:00Z"),
				at("2026-07-01T12:00:00Z"),
			).memory,
		);
		home.saveWeather(weather(4));
		expect(
			automations.check(
				cold,
				home,
				at("2026-07-01T12:00:00Z"),
				at("2026-07-01T12:01:00Z"),
			).due,
		).toBe(true);
	});

	test("a tick runs what's due, blinds by room or the whole house, and records failures", async () => {
		const home = parisHome();
		const bedroom = RoomDTO.create(home.id, {
			name: "Bedroom",
			icon: "bed",
			floorId: null,
			outdoor: false,
		});
		const cover = (name: string, roomId: string | null) =>
			DeviceDTO.upsert({
				kind: "tuya-cover",
				homeId: home.id,
				name,
				externalId: name,
				roomId,
			});
		cover("bedroom-blind", bedroom.toJSON().id);
		cover("kitchen-blind", null);
		const pump = DeviceDTO.upsert({
			kind: "melcloud-ata",
			homeId: home.id,
			name: "Pump",
			externalId: "1",
		});
		const moved: string[] = [];
		const sent: DeviceCommand[] = [];
		const command = spyOn(devices, "command").mockImplementation(
			async (device, given) => {
				sent.push(given);
				if (given.type === "cover") {
					moved.push(
						`${device.externalId}:${"action" in given.move ? given.move.action : given.move.position}`,
					);
				}
				if (given.type === "climate") {
					throw new Error("MELCloud is down.");
				}
			},
		);
		const due = make(home, {
			name: "Evening",
			actions: [
				{
					type: "blinds",
					roomId: bedroom.toJSON().id,
					move: "position",
					position: 20,
				},
				{ type: "blinds", roomId: null, move: "close", position: null },
				{
					type: "device",
					deviceId: pump.id,
					command: {
						type: "climate",
						change: { power: true, mode: "heat", targetTemperature: 19 },
					},
				},
				{
					type: "device",
					deviceId: "gone",
					command: { type: "vacuum", change: { command: "start" } },
				},
				{
					type: "device",
					deviceId: pump.id,
					command: { type: "printer", change: { command: "pause" } },
				},
			],
		});
		make(home, {
			name: "Later",
			trigger: { type: "time", time: "23:00", weekdays: [1] },
		});
		const off = make(home, { name: "Off" });
		off.setEnabled(false);
		expect(
			await automations.tick(AutomationDTO.all(), at("2026-12-15T16:00:00Z")),
		).toBe(1);
		expect(moved).toEqual([
			"bedroom-blind:20",
			"bedroom-blind:close",
			"kitchen-blind:close",
		]);
		const row = AutomationDTO.find(due.id)?.toJSON();
		expect(row?.ranAt).toBeInstanceOf(Date);
		expect(row?.runError).toBe(
			"Pump: MELCloud is down. A device it drives is gone.",
		);
		expect(sent).toContainEqual({
			type: "climate",
			change: { power: true, mode: "heat", targetTemperature: 19 },
		});
		expect(sent.some((entry) => entry.type === "printer")).toBe(true);
		expect(sent.some((entry) => entry.type === "vacuum")).toBe(false);
		expect(
			await automations.tick(AutomationDTO.all(), at("2026-12-15T16:01:00Z")),
		).toBe(0);
		command.mockRestore();
	});

	test("jobs run one automation now, and tick every minute", async () => {
		const home = parisHome();
		const automation = make(home, {
			actions: [{ type: "blinds", roomId: null, move: "open", position: null }],
		});
		await jobHandlers["automation.run"]({ automationId: automation.id });
		expect(AutomationDTO.find(automation.id)?.toJSON().runError).toBe(
			"No blind to move.",
		);
		await jobHandlers["automation.run"]({ automationId: "gone" });
		await jobHandlers["automations.tick"]({});
		expect(AutomationDTO.find(automation.id)?.checkedAt).toBeInstanceOf(Date);
		automation.update({
			name: "Renamed",
			trigger: { type: "sun", event: "sunrise", offsetMinutes: 0 },
			period: { type: "always" },
			conditions: [],
			actions: automation.actions,
		});
		expect(AutomationDTO.inHome(home.id)[0]?.name).toBe("Renamed");
		expect(AutomationDTO.find(automation.id)?.checkedAt).toBeNull();
		home.delete();
		expect(AutomationDTO.all()).toHaveLength(0);
	});

	test("the form takes a JSON definition and refuses a broken one", () => {
		const definition = {
			name: "Hot",
			trigger: { type: "temperature", direction: "above", threshold: 28 },
			period: { type: "dates", from: "06-01", to: "08-31" },
			actions: [
				{ type: "blinds", roomId: null, move: "close", position: null },
			],
		};
		expect(
			automationFormSchema.safeParse({ definition: JSON.stringify(definition) })
				.success,
		).toBe(true);
		expect(automationFormSchema.safeParse({ definition: "{" }).success).toBe(
			false,
		);
		expect(
			automationFormSchema.safeParse({
				definition: JSON.stringify({ ...definition, actions: [] }),
			}).success,
		).toBe(false);
	});

	test("every preset builds an automation the form accepts", () => {
		const house = [
			{ id: "window", card: "contact" as const },
			{ id: "radiator", card: "valve" as const },
		];
		for (const key of presetKeys) {
			expect(
				automationSchema.safeParse(presets[key].build(house)).success,
			).toBe(true);
		}
	});
});
