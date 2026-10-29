import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { ValveState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { RoomDTO } from "#lib/dto/room.js";
import { presets } from "#lib/server/automations/presets.js";
import { broker } from "#lib/server/devices/broker.js";

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

describe("presets", () => {
	beforeEach(resetDatabase);

	test("switch on and off per home", () => {
		presets.set(homeId(), "window-valves", true);
		expect(presets.enabled(homeId())).toEqual(["window-valves"]);
		presets.set(homeId(), "window-valves", false);
		expect(presets.enabled(homeId())).toEqual([]);
		expect(presets.enabled("elsewhere")).toEqual([]);
	});

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
		await presets.onContact(window, open);
		expect(sent).toEqual([]);

		presets.set(homeId(), "window-valves", true);
		await presets.onContact(window, open);
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({
			target: 5,
			heldBy: "Window",
			heldTarget: 21,
		});
		expect(DeviceDTO.find(elsewhere.id)?.state).toMatchObject({ target: 20 });

		door.saveState(open);
		await presets.onContact(door, open);
		window.saveState(shut);
		await presets.onContact(window, shut);
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({ heldBy: "Window" });

		door.saveState(shut);
		await presets.onContact(door, shut);
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
		await presets.onContact(window, open);
		expect(DeviceDTO.find(valve.id)?.state).toMatchObject({ heldBy: null });
		await presets.onContact(add("zigbee-contact", "Shed", null), open);
		publish.mockRestore();
	});
});
