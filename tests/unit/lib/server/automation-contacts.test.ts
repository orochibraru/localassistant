import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import { presets } from "#lib/automations.js";
import type { ValveState } from "#lib/devices.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { RoomDTO } from "#lib/dto/room.js";
import { automations } from "#lib/server/automations/automations.js";
import { broker } from "#lib/server/devices/broker.js";
import { devices } from "#lib/server/devices/devices.js";

import { homeId, resetDatabase } from "../../database.js";

function valveState(target: number): ValveState {
	return {
		type: "valve",
		target,
		temperature: 19,
		battery: 80,
		setpoint: "occupied_heating_setpoint",
		min: 5,
		max: 30,
		heldBy: null,
		heldTarget: null,
	};
}

describe("door and window automations", () => {
	beforeEach(resetDatabase);

	test("a window closes its room's valves until every window there is shut", async () => {
		const sent: Record<string, unknown>[] = [];
		const publish = spyOn(broker, "publish").mockImplementation(
			async (_device, payload) => {
				sent.push(payload);
			},
		);
		const room = RoomDTO.create(homeId(), {
			name: "Bedroom",
			icon: "bed",
			floorId: null,
			outdoor: false,
		}).toJSON().id;
		const add = (
			kind: "zigbee-contact" | "zigbee-valve",
			name: string,
			roomId: string | null = room,
		) =>
			DeviceDTO.upsert({
				kind,
				homeId: homeId(),
				name,
				externalId: name,
				roomId,
				host: name,
			});
		const window = add("zigbee-contact", "Window");
		const door = add("zigbee-contact", "Door");
		const valve = add("zigbee-valve", "Radiator");
		const elsewhere = add("zigbee-valve", "Kitchen radiator", null);
		valve.saveState(valveState(21));
		elsewhere.saveState(valveState(20));
		door.saveState({ type: "contact", open: false, battery: 90 });
		const open = { type: "contact" as const, open: true, battery: 90 };
		const shut = { ...open, open: false };

		window.saveState(open);
		await automations.onContact(window, open);
		expect(sent).toEqual([]);

		const template = presets["window-valves"].build(
			DeviceDTO.inHome(homeId()).map((device) => ({
				id: device.id,
				kind: device.kind,
			})),
		);
		const automation = AutomationDTO.create(homeId(), {
			...template,
			trigger: { type: "contact", deviceIds: [window.id] },
		});
		await automations.onContact(door, open);
		expect(sent).toEqual([]);
		automation.update(template);
		await automations.onContact(window, open);
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({
			target: 5,
			heldBy: "Window",
			heldTarget: 21,
		});
		expect(DeviceDTO.find(elsewhere.id)?.state).toMatchObject({ target: 20 });

		door.saveState(open);
		await automations.onContact(door, open);
		window.saveState(shut);
		await automations.onContact(window, shut);
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({ heldBy: "Window" });

		door.saveState(shut);
		await automations.onContact(door, shut);
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({
			target: 21,
			heldBy: null,
			heldTarget: null,
		});
		expect(sent).toEqual([
			{ occupied_heating_setpoint: 5 },
			{ occupied_heating_setpoint: 21 },
		]);

		publish.mockRejectedValue(new Error("broker down"));
		window.saveState(open);
		await automations.onContact(window, open);
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({ heldBy: null });
		await automations.onContact(add("zigbee-contact", "Shed", null), open);
		publish.mockRestore();
	});

	test("runs by hand, never by the clock, and only in its period", async () => {
		const publish = spyOn(broker, "publish").mockResolvedValue();
		const valve = DeviceDTO.upsert({
			kind: "zigbee-valve",
			homeId: homeId(),
			name: "Radiator",
			externalId: "radiator",
		});
		const sensor = DeviceDTO.upsert({
			kind: "zigbee-contact",
			homeId: homeId(),
			name: "Window",
			externalId: "window",
		});
		valve.saveState(valveState(21));
		const automation = AutomationDTO.create(homeId(), {
			name: "Winter windows",
			trigger: { type: "contact", deviceIds: [sensor.id] },
			period: { type: "dates", from: "02-30", to: "02-30" },
			actions: [{ type: "valves", deviceIds: [valve.id] }],
		});
		expect(await automations.tick([automation])).toBe(0);
		await automations.onContact(sensor, {
			type: "contact",
			open: true,
			battery: 90,
		});
		expect(publish).not.toHaveBeenCalled();
		await automations.run(automation);
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({
			target: 5,
			heldBy: "Winter windows",
		});
		publish.mockRestore();
	});

	test("a front door turns the heating down and puts it back once it shuts", async () => {
		const publish = spyOn(broker, "publish").mockResolvedValue();
		const climate = spyOn(devices, "climate").mockResolvedValue();
		const door = DeviceDTO.upsert({
			kind: "zigbee-contact",
			homeId: homeId(),
			name: "Front door",
			externalId: "front-door",
		});
		const pump = DeviceDTO.upsert({
			kind: "melcloud-ata",
			homeId: homeId(),
			name: "Heat pump",
			externalId: "pump",
		});
		const valve = DeviceDTO.upsert({
			kind: "zigbee-valve",
			homeId: homeId(),
			name: "Radiator",
			externalId: "radiator",
		});
		pump.saveState({
			type: "climate",
			power: true,
			mode: "heat",
			modes: ["heat"],
			targetTemperature: 21,
			roomTemperature: 20,
			minTemperature: 10,
			maxTemperature: 30,
			offline: false,
		});
		valve.saveState(valveState(20));
		const template = presets["door-heating"].build(
			DeviceDTO.inHome(homeId()).map((device) => ({
				id: device.id,
				kind: device.kind,
				roomId: device.toJSON().roomId,
			})),
		);
		const automation = AutomationDTO.create(homeId(), {
			...template,
			period: { type: "always" },
		});
		const open = { type: "contact" as const, open: true, battery: 90 };

		door.saveState(open);
		await automations.onContact(door, open);
		await automations.onContact(door, open);
		expect(climate).toHaveBeenCalledTimes(1);
		expect(climate).toHaveBeenLastCalledWith(expect.anything(), {
			targetTemperature: 18,
		});
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({ target: 17 });
		expect(AutomationDTO.find(automation.id)?.memory).toEqual({
			lowered: { [pump.id]: 21, [valve.id]: 20 },
		});

		door.saveState({ ...open, open: false });
		await automations.onContact(door, { ...open, open: false });
		expect(climate).toHaveBeenLastCalledWith(expect.anything(), {
			targetTemperature: 21,
		});
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({ target: 20 });
		expect(AutomationDTO.find(automation.id)?.memory).toEqual({ lowered: {} });

		climate.mockRejectedValue(new Error("offline"));
		door.saveState(open);
		await automations.onContact(door, open);
		expect(AutomationDTO.find(automation.id)?.toJSON().runError).toContain(
			"offline",
		);
		publish.mockRestore();
		climate.mockRestore();
	});
});
