import { beforeEach, describe, expect, test } from "bun:test";

import type { AutomationDefinition } from "#lib/dto/automation.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { library } from "#lib/server/automations/library.js";

import { createUser, homeId, resetDatabase } from "../../database.js";

const base: AutomationDefinition = {
	name: "Test",
	trigger: { type: "sun", event: "sunset", offsetMinutes: 0 },
	period: { type: "always" },
	conditions: [],
	actions: [{ type: "delay", minutes: 1 }],
};

describe("the automation library", () => {
	beforeEach(() => {
		resetDatabase();
		createUser("ada");
	});

	test("refuses routines pointing at what's gone, and saves the rest", () => {
		const home = homeId();
		const save = (changes: Partial<AutomationDefinition>) => () =>
			library.saveRoutine(home, undefined, { ...base, ...changes });
		expect(save({ trigger: { type: "contact", deviceIds: ["gone"] } })).toThrow(
			"A door or window sensor it watches is gone.",
		);
		expect(
			save({
				trigger: {
					type: "device",
					test: { deviceId: "gone", check: "on", value: null },
				},
			}),
		).toThrow("The device it watches is gone");
		expect(
			save({
				conditions: [
					{
						type: "device",
						test: { deviceId: "gone", check: "on", value: null },
					},
				],
			}),
		).toThrow("A device one of its conditions looks at is gone.");
		expect(
			save({ actions: [{ type: "valves", deviceIds: ["gone"] }] }),
		).toThrow("A radiator valve it closes is gone.");
		expect(
			save({ actions: [{ type: "heating", deviceIds: ["gone"], degrees: 2 }] }),
		).toThrow("A heater it turns down is gone.");
		expect(
			save({
				actions: [
					{ type: "blinds", roomId: "gone", move: "close", position: null },
				],
			}),
		).toThrow("A room it moves the blinds of is gone.");
		expect(
			save({
				actions: [
					{ type: "notify", who: "gone", title: "Hi", body: "", sceneIds: [] },
				],
			}),
		).toThrow("The account it tells is gone.");
		expect(
			save({
				actions: [
					{
						type: "notify",
						who: "ada",
						title: "Hi",
						body: "",
						sceneIds: ["gone"],
					},
				],
			}),
		).toThrow("A scene its notification offers is gone.");
		expect(
			save({
				actions: [
					{
						type: "device",
						deviceId: "gone",
						command: { type: "switch", on: true },
					},
				],
			}),
		).toThrow("A device it drives is gone");
		const lamp = DeviceDTO.upsert({
			homeId: home,
			kind: "mqtt-discovery-light",
			name: "Lamp",
			externalId: "lamp",
		});
		const saved = library.saveRoutine(home, undefined, {
			...base,
			trigger: {
				type: "device",
				test: { deviceId: lamp.id, check: "on", value: null },
			},
			actions: [
				{
					type: "notify",
					who: "everyone",
					title: "Lamp",
					body: "",
					sceneIds: [],
				},
			],
		});
		expect(library.devicesOf(saved)).toEqual([lamp.id]);
		expect(() => library.saveRoutine(home, "gone", base)).toThrow(
			"That routine is gone.",
		);
		library.saveRoutine(home, saved.id, { ...base, name: "Renamed" });
		expect(AutomationDTO.find(saved.id)?.name).toBe("Renamed");
		expect(library.removeRoutine(home, saved.id)).toBe(true);
		expect(library.removeRoutine(home, saved.id)).toBe(false);
	});

	test("scenes only keep devices that take their command", () => {
		const home = homeId();
		const lamp = DeviceDTO.upsert({
			homeId: home,
			kind: "mqtt-discovery-light",
			name: "Lamp",
			externalId: "lamp",
		});
		const members = [
			{
				deviceId: lamp.id,
				command: { type: "light" as const, change: { on: true } },
			},
		];
		expect(() =>
			library.saveScene(home, undefined, {
				name: "Bad",
				members: [
					{ deviceId: lamp.id, command: { type: "lock", locked: true } },
				],
			}),
		).toThrow("can't take that");
		const scene = library.saveScene(home, undefined, {
			name: "Evening",
			members,
		});
		expect(() =>
			library.saveScene(home, "gone", { name: "X", members }),
		).toThrow("That scene is gone.");
		expect(
			library.saveScene(home, scene.id, { name: "Night", members }).name,
		).toBe("Night");
		expect(library.removeScene(home, scene.id)).toBe(true);
		expect(library.removeScene(home, scene.id)).toBe(false);
	});
});
