import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { DeviceState } from "#lib/devices.js";
import { AutomationRunDTO } from "#lib/dto/automation-run.js";
import {
	type AutomationDefinition,
	AutomationDTO,
} from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { JobDTO } from "#lib/dto/job.js";
import { SceneDTO } from "#lib/dto/scene.js";
import type { DeviceCommand } from "#lib/plugin-sdk.js";
import { automations } from "#lib/server/automations/automations.js";
import { scenes } from "#lib/server/automations/scenes.js";
import { deviceEvents } from "#lib/server/devices/device-events.js";
import { devices } from "#lib/server/devices/devices.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";
import {
	automationSchema,
	deviceCommandSchema,
} from "#lib/server/validation/automation.js";
import { sceneFormSchema } from "#lib/server/validation/scene.js";

import { resetDatabase } from "../../database.js";

const light = (on: boolean) =>
	({
		type: "light",
		on,
		brightness: null,
		temperature: null,
		minTemperature: 2000,
		maxTemperature: 6500,
		color: null,
		features: [],
	}) satisfies DeviceState;

function parisHome(): HomeDTO {
	const home = HomeDTO.first();
	home.locate({
		place: "Clermont-Ferrand, France",
		latitude: 45.77,
		longitude: 3.08,
		timezone: "Europe/Paris",
	});
	home.saveWeather({
		temperature: 10,
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
	});
	return home;
}

function lamp(home: HomeDTO, name = "Lamp"): DeviceDTO {
	const device = DeviceDTO.upsert({
		kind: "mqtt-discovery-light",
		homeId: home.id,
		name,
		externalId: name,
	});
	device.saveState(light(false));
	return device;
}

function make(home: HomeDTO, definition: Partial<AutomationDefinition>) {
	return AutomationDTO.create(home.id, {
		name: "Test",
		trigger: { type: "sun", event: "sunset", offsetMinutes: 0 },
		period: { type: "always" },
		conditions: [],
		actions: [{ type: "delay", minutes: 1 }],
		...definition,
	});
}

function sending() {
	const sent: { device: string; command: DeviceCommand }[] = [];
	const spy = spyOn(devices, "command").mockImplementation(
		async (device, command) => {
			sent.push({ device: device.toJSON().name, command });
			if (device.toJSON().name === "Broken") {
				throw new Error("It's offline.");
			}
		},
	);
	return { sent, restore: () => spy.mockRestore() };
}

describe("routine conditions", () => {
	beforeEach(resetDatabase);

	test("hold on a device's state, a window of time, weekdays and the sun", () => {
		const home = parisHome();
		const device = lamp(home);
		const tuesdayNight = new Date("2026-12-15T21:30:00Z");
		const tuesdayNoon = new Date("2026-12-15T11:00:00Z");
		expect(
			automations.holds(
				{
					type: "device",
					test: { deviceId: device.id, check: "off", value: null },
				},
				home,
				tuesdayNight,
			),
		).toBe(true);
		expect(
			automations.holds(
				{
					type: "device",
					test: { deviceId: "gone", check: "off", value: null },
				},
				home,
				tuesdayNight,
			),
		).toBe(false);
		expect(
			automations.holds(
				{ type: "time", from: "22:00", to: "06:00" },
				home,
				tuesdayNight,
			),
		).toBe(true);
		expect(
			automations.holds(
				{ type: "time", from: "22:00", to: "06:00" },
				home,
				tuesdayNoon,
			),
		).toBe(false);
		expect(
			automations.holds(
				{ type: "weekdays", weekdays: [1] },
				home,
				tuesdayNight,
			),
		).toBe(true);
		expect(
			automations.holds({ type: "sun", when: "night" }, home, tuesdayNight),
		).toBe(true);
		expect(
			automations.holds({ type: "sun", when: "day" }, home, tuesdayNoon),
		).toBe(true);
		home.saveWeather({ ...home.weather!, days: [] });
		expect(
			automations.holds({ type: "sun", when: "night" }, home, tuesdayNight),
		).toBe(false);
	});

	test("a routine whose condition doesn't hold is recorded as skipped", async () => {
		const home = parisHome();
		const device = lamp(home);
		const routine = make(home, {
			name: "Night light",
			conditions: [
				{
					type: "device",
					test: { deviceId: device.id, check: "on", value: null },
				},
			],
		});
		expect(
			await automations.trigger(
				routine,
				home,
				new Date("2026-12-15T21:30:00Z"),
			),
		).toBe(false);
		expect(AutomationRunDTO.recentInHome(home.id)).toMatchObject([
			{
				automationName: "Night light",
				cause: "At sunset",
				status: "skipped",
				error: "Lamp is on: not now.",
			},
		]);
		expect(AutomationDTO.find(routine.id)?.toJSON().ranAt).toBeNull();
	});
});

describe("routine triggers and steps", () => {
	beforeEach(resetDatabase);

	test("a device reaching a state sets its routines off once, in their period", async () => {
		const home = parisHome();
		const device = lamp(home);
		const other = lamp(home, "Other");
		const { sent, restore } = sending();
		make(home, {
			name: "Follow",
			trigger: {
				type: "device",
				test: { deviceId: device.id, check: "on", value: null },
			},
			actions: [
				{
					type: "device",
					deviceId: other.id,
					command: { type: "switch", on: true },
				},
			],
		});
		make(home, {
			name: "Never",
			trigger: {
				type: "device",
				test: { deviceId: device.id, check: "on", value: null },
			},
			period: { type: "dates", from: "02-30", to: "02-30" },
		});
		make(home, {
			name: "Off",
			trigger: {
				type: "device",
				test: { deviceId: device.id, check: "on", value: null },
			},
		}).setEnabled(false);
		await automations.onChange(device, light(false), light(true));
		await automations.onChange(device, light(true), light(true));
		await automations.onChange(other, light(false), light(true));
		expect(sent).toEqual([
			{ device: "Other", command: { type: "switch", on: true } },
		]);
		expect(AutomationRunDTO.recentInHome(home.id)).toMatchObject([
			{ automationName: "Follow", cause: "Lamp turns on", status: "done" },
		]);
		restore();
	});

	test("a delay waits for the worker, which carries on unless the routine changed", async () => {
		const home = parisHome();
		const device = lamp(home);
		const { sent, restore } = sending();
		const routine = make(home, {
			name: "Later",
			actions: [
				{
					type: "device",
					deviceId: device.id,
					command: { type: "light", change: { on: true } },
				},
				{ type: "delay", minutes: 10 },
				{
					type: "device",
					deviceId: device.id,
					command: { type: "light", change: { on: false } },
				},
			],
		});
		await automations.run(routine, "Run by hand");
		expect(sent).toHaveLength(1);
		const [waiting] = AutomationRunDTO.recentInHome(home.id);
		expect(waiting).toMatchObject({ status: "waiting" });
		expect(JobDTO.nextRun("automation.resume")?.getTime()).toBeGreaterThan(
			Date.now() + 9 * 60_000,
		);
		const job = JobDTO.claimNext(new Date(Date.now() + 11 * 60_000));
		expect(job?.type).toBe("automation.resume");
		await jobHandlers["automation.resume"](
			job?.payload as Parameters<(typeof jobHandlers)["automation.resume"]>[0],
		);
		expect(sent.map((entry) => entry.command)).toEqual([
			{ type: "light", change: { on: true } },
			{ type: "light", change: { on: false } },
		]);
		expect(AutomationRunDTO.find(waiting?.id ?? "")?.status).toBe("done");

		await automations.run(routine, "Run by hand");
		const [cancelled] = AutomationRunDTO.recentInHome(home.id);
		AutomationRunDTO.cancelWaiting(routine.id);
		await automations.resume({
			automationId: routine.id,
			runId: cancelled?.id ?? "",
			step: 2,
			roomId: null,
			by: null,
		});
		expect(sent).toHaveLength(3);
		expect(AutomationRunDTO.find(cancelled?.id ?? "")).toMatchObject({
			status: "failed",
		});
		await automations.resume({
			automationId: "gone",
			runId: "gone",
			step: 0,
			roomId: null,
			by: null,
		});
		restore();
	});

	test("a failure before a delay is recorded while it waits", async () => {
		const home = parisHome();
		const broken = lamp(home, "Broken");
		const { restore } = sending();
		const routine = make(home, {
			actions: [
				{
					type: "device",
					deviceId: broken.id,
					command: { type: "light", change: { on: true } },
				},
				{ type: "delay", minutes: 5 },
			],
		});
		await automations.run(routine, "Run by hand", {
			roomId: null,
			by: "Front door",
		});
		expect(AutomationDTO.find(routine.id)?.toJSON().runError).toBe(
			"Broken: It's offline.",
		);
		const job = JobDTO.claimNext(new Date(Date.now() + 6 * 60_000));
		expect(job?.payload).toMatchObject({ by: "Front door", step: 2 });
		restore();
	});

	test("scenes set every device, and report what failed or is gone", async () => {
		const home = parisHome();
		const device = lamp(home);
		const broken = lamp(home, "Broken");
		const { sent, restore } = sending();
		const scene = SceneDTO.create(home.id, {
			name: "Movie night",
			members: [
				{
					deviceId: device.id,
					command: { type: "light", change: { on: false } },
				},
				{ deviceId: broken.id, command: { type: "switch", on: true } },
				{ deviceId: "gone", command: { type: "switch", on: true } },
			],
		});
		expect(await scenes.activate(scene)).toEqual([
			"Broken: It's offline.",
			"A device in the scene is gone.",
		]);
		expect(sent).toHaveLength(2);
		const routine = make(home, {
			actions: [
				{ type: "scene", sceneId: scene.id },
				{ type: "scene", sceneId: "gone" },
			],
		});
		await automations.run(routine, "Run by hand");
		expect(AutomationDTO.find(routine.id)?.toJSON().runError).toBe(
			"Broken: It's offline. A device in the scene is gone. A scene it sets is gone.",
		);

		scene.update({ name: "Bedtime", members: scene.members.slice(0, 1) });
		expect(SceneDTO.inHome(home.id).map((entry) => entry.name)).toEqual([
			"Bedtime",
		]);
		expect(SceneDTO.find(scene.id, home.id)?.members).toHaveLength(1);
		expect(SceneDTO.find(scene.id)?.homeId).toBe(home.id);
		SceneDTO.find(scene.id)?.delete();
		expect(SceneDTO.find(scene.id)).toBeUndefined();
		restore();
	});

	test("old runs are pruned, and a run by hand from the job is recorded", async () => {
		const home = parisHome();
		const routine = make(home, {
			actions: [{ type: "blinds", roomId: null, move: "open", position: null }],
		});
		await jobHandlers["automation.run"]({ automationId: routine.id });
		expect(AutomationRunDTO.recentInHome(home.id)).toMatchObject([
			{ cause: "Run by hand", status: "failed", error: "No blind to move." },
		]);
		AutomationRunDTO.skipped(routine.id, "At sunset", "Not now.");
		expect(AutomationRunDTO.prune(new Date(Date.now() + 1000))).toBe(2);
		jobHandlers["jobs.prune"]({ olderThanDays: 1 });
		expect(AutomationRunDTO.recentInHome(home.id)).toEqual([]);
	});

	test("device events tell change listeners only when a state differs", async () => {
		const home = parisHome();
		const device = lamp(home);
		const heard: [DeviceState | null, DeviceState][] = [];
		deviceEvents.onChange((_device, previous, next) => {
			heard.push([previous, next]);
		});
		deviceEvents.onChange(() => {
			throw new Error("listener broke");
		});
		deviceEvents.save(device, light(true));
		deviceEvents.save(device, light(true));
		await Bun.sleep(1);
		expect(heard).toEqual([[light(false), light(true)]]);
	});
});

describe("routine and scene forms", () => {
	test("take every kind of device command and refuse a bad one", () => {
		const commands: DeviceCommand[] = [
			{ type: "cover", move: { position: 30 } },
			{ type: "climate", change: { power: true, mode: "heat" } },
			{ type: "printer", change: { command: "pause", speed: 2 } },
			{ type: "vacuum", change: { command: "dock" } },
			{ type: "valve", target: 19 },
			{ type: "switch", on: false },
			{ type: "light", change: { brightness: 40 } },
			{ type: "lock", locked: true },
			{ type: "fan", change: { speed: 50 } },
			{ type: "media", change: { action: "play" } },
			{ type: "button" },
		];
		for (const command of commands) {
			expect(deviceCommandSchema.safeParse(command).success).toBe(true);
		}
		expect(
			deviceCommandSchema.safeParse({
				type: "light",
				change: { brightness: 200 },
			}).success,
		).toBe(false);
	});

	test("check conditions, state tests, delays and scenes", () => {
		const routine = {
			name: "Night",
			trigger: {
				type: "device",
				test: { deviceId: "d", check: "above", value: 25 },
			},
			period: { type: "always" },
			conditions: [
				{ type: "time", from: "22:00", to: "06:00" },
				{ type: "weekdays", weekdays: [0, 1] },
				{ type: "sun", when: "night" },
				{
					type: "device",
					test: { deviceId: "d", check: "on", value: null },
				},
			],
			actions: [
				{ type: "delay", minutes: 5 },
				{ type: "scene", sceneId: "s" },
			],
		};
		expect(automationSchema.safeParse(routine).success).toBe(true);
		expect(
			automationSchema.safeParse({
				...routine,
				trigger: {
					type: "device",
					test: { deviceId: "d", check: "above", value: null },
				},
			}).success,
		).toBe(false);
		expect(
			automationSchema.safeParse({
				...routine,
				actions: [{ type: "delay", minutes: 2000 }],
			}).success,
		).toBe(false);
		const { conditions: _conditions, ...withoutConditions } = routine;
		expect(automationSchema.parse(withoutConditions).conditions).toEqual([]);
		expect(
			sceneFormSchema.safeParse({
				definition: JSON.stringify({
					name: "Bedtime",
					members: [{ deviceId: "d", command: { type: "switch", on: false } }],
				}),
			}).success,
		).toBe(true);
		expect(
			sceneFormSchema.safeParse({
				definition: JSON.stringify({ name: "Empty", members: [] }),
			}).success,
		).toBe(false);
		expect(sceneFormSchema.safeParse({ definition: "{" }).success).toBe(false);
	});
});
