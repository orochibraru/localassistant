import { beforeEach, describe, expect, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { RoomDTO } from "#lib/dto/room.js";

import { homeId, resetDatabase } from "../../database.js";

function room(name: string, floorId: string | null = null, outdoor = false) {
	return RoomDTO.create(homeId(), { name, icon: "door", floorId, outdoor });
}

describe("RoomDTO", () => {
	beforeEach(resetDatabase);

	test("rooms are listed by name, changed, and their names stay unique", () => {
		const office = room("Office");
		room("Kitchen");
		expect(
			RoomDTO.inHome(homeId()).map((entry) => entry.toJSON().name),
		).toEqual(["Kitchen", "Office"]);
		const indoors = { floorId: null, outdoor: false };
		expect(RoomDTO.nameTaken("Kitchen", homeId(), indoors)).toBe(true);
		expect(
			RoomDTO.nameTaken("Kitchen", homeId(), { floorId: null, outdoor: true }),
		).toBe(false);
		expect(
			RoomDTO.nameTaken("Office", homeId(), indoors, office.toJSON().id),
		).toBe(false);
		expect(RoomDTO.nameTaken("Garage", homeId(), indoors)).toBe(false);
		office.update({
			name: "Garage",
			icon: "garage",
			floorId: null,
			outdoor: true,
		});
		expect(RoomDTO.find(office.toJSON().id, homeId())?.toJSON()).toMatchObject({
			name: "Garage",
			icon: "garage",
			outdoor: true,
		});
		expect(RoomDTO.find("gone", homeId())).toBeUndefined();
	});

	test("devices sit in a room or the whole house, and a removed room hands its devices back", () => {
		const kitchen = room("Kitchen");
		const roomId = kitchen.toJSON().id;
		const blind = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "tuya-cover",
			name: "Kitchen blind",
			externalId: "bf0000000000kitchen0",
			roomId,
		});
		DeviceDTO.upsert({
			homeId: homeId(),
			kind: "melcloud-atw",
			name: "PAC",
			externalId: "78",
		});
		expect(
			DeviceDTO.inRoom(homeId(), roomId).map((device) => device.name),
		).toEqual(["Kitchen blind"]);
		expect(
			DeviceDTO.inRoom(homeId(), null).map((device) => device.name),
		).toEqual(["PAC"]);
		kitchen.delete();
		expect(DeviceDTO.find(blind.id)?.toJSON().roomId).toBeNull();
		expect(DeviceDTO.inRoom(homeId(), null)).toHaveLength(2);
		blind.rename("Blind", null);
		expect(DeviceDTO.find(blind.id)?.toJSON()).toMatchObject({
			name: "Blind",
			roomId: null,
		});
	});
});

describe("FloorDTO", () => {
	beforeEach(resetDatabase);

	test("the first floor takes every indoor room, outside ones stay outside", () => {
		const kitchen = room("Kitchen");
		const garage = room("Garage", null, true);
		const ground = FloorDTO.create(homeId(), "Ground floor", 0).toJSON().id;
		expect(RoomDTO.find(kitchen.toJSON().id, homeId())?.toJSON().floorId).toBe(
			ground,
		);
		expect(
			RoomDTO.find(garage.toJSON().id, homeId())?.toJSON().floorId,
		).toBeNull();
	});

	test("floors are listed lowest first, and a removed floor hands its rooms to the nearest", () => {
		const first = FloorDTO.create(homeId(), "First floor", 1);
		const ground = FloorDTO.create(homeId(), "Ground floor", 0);
		const basement = FloorDTO.create(homeId(), "Basement", -1);
		expect(
			FloorDTO.inHome(homeId()).map((floor) => floor.toJSON().name),
		).toEqual(["Basement", "Ground floor", "First floor"]);
		expect(FloorDTO.nearestGround(homeId())?.toJSON().name).toBe(
			"Ground floor",
		);
		expect(FloorDTO.nameTaken("Basement", homeId())).toBe(true);
		expect(FloorDTO.nameTaken("First floor", homeId(), first.toJSON().id)).toBe(
			false,
		);
		first.update("Attic", 2);
		expect(FloorDTO.find(first.toJSON().id, homeId())?.toJSON()).toMatchObject({
			name: "Attic",
			level: 2,
		});
		const bedroom = room("Bedroom", ground.toJSON().id);
		ground.delete();
		expect(FloorDTO.find(ground.toJSON().id, homeId())).toBeUndefined();
		expect(RoomDTO.find(bedroom.toJSON().id, homeId())?.toJSON().floorId).toBe(
			basement.toJSON().id,
		);
		basement.delete();
		first.delete();
		expect(
			RoomDTO.find(bedroom.toJSON().id, homeId())?.toJSON().floorId,
		).toBeNull();
	});
});

describe("rooms with the same name", () => {
	beforeEach(resetDatabase);

	test("can sit on different floors, not on the same one", () => {
		const ground = FloorDTO.create(homeId(), "Ground floor", 0).toJSON().id;
		const first = FloorDTO.create(homeId(), "First floor", 1).toJSON().id;
		room("Bathroom", ground);
		expect(
			RoomDTO.nameTaken("Bathroom", homeId(), {
				floorId: ground,
				outdoor: false,
			}),
		).toBe(true);
		expect(
			RoomDTO.nameTaken("Bathroom", homeId(), {
				floorId: first,
				outdoor: false,
			}),
		).toBe(false);
		room("Bathroom", first);
		expect(
			RoomDTO.inHome(homeId()).filter(
				(entry) => entry.toJSON().name === "Bathroom",
			),
		).toHaveLength(2);
	});
});

describe("RoomDTO.place", () => {
	beforeEach(resetDatabase);

	test("draws a room on the plan and takes it off", () => {
		const kitchen = room("Kitchen");
		const shape = [
			{ x: 1, y: 2, width: 6, height: 4 },
			{ x: 1, y: 6, width: 2, height: 3 },
		];
		kitchen.place(shape);
		expect(RoomDTO.find(kitchen.toJSON().id, homeId())?.toJSON().plan).toEqual(
			shape,
		);
		kitchen.place(null);
		expect(
			RoomDTO.find(kitchen.toJSON().id, homeId())?.toJSON().plan,
		).toBeNull();
	});
});
