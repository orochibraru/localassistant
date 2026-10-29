import { beforeEach, describe, expect, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { houseConfiguration } from "#lib/server/house/house-config.js";
import { houseConfigSchema } from "#lib/server/validation/house-config.js";

import { resetDatabase } from "../../database.js";

function furnish(home: HomeDTO) {
	const ground = FloorDTO.create(home.id, "Ground floor", 0).toJSON().id;
	const first = FloorDTO.create(home.id, "First floor", 1).toJSON().id;
	const bathDown = RoomDTO.create(home.id, {
		name: "Bathroom",
		icon: "bathroom",
		floorId: ground,
		outdoor: false,
	}).toJSON().id;
	RoomDTO.create(home.id, {
		name: "Bathroom",
		icon: "bathroom",
		floorId: first,
		outdoor: false,
	});
	RoomDTO.create(home.id, {
		name: "Garage",
		icon: "garage",
		floorId: null,
		outdoor: true,
	});
	DeviceDTO.upsert({
		homeId: home.id,
		kind: "tuya-cover",
		name: "Bathroom blind",
		externalId: "bf0000000000bath0000",
		roomId: bathDown,
		host: "192.168.1.40",
		protocolVersion: "3.4",
		encryptedLocalKey: secrets.encrypt("abcdabcdabcdabcd"),
	});
	DeviceDTO.upsert({
		homeId: home.id,
		kind: "app",
		name: "Ada's phone",
		externalId: "browser-1",
	});
	setSetting("melcloud", {
		email: "ada@example.com",
		encryptedPassword: secrets.encrypt("hunter2"),
	});
}

describe("house configuration", () => {
	beforeEach(resetDatabase);

	test("exports a home without secrets unless asked", () => {
		const home = HomeDTO.first();
		furnish(home);
		const plain = houseConfiguration.export(home, false);
		expect(plain.floors).toEqual([
			{ name: "Ground floor", level: 0, planBase: true },
			{ name: "First floor", level: 1, planBase: false },
		]);
		expect(plain.rooms).toHaveLength(3);
		expect(plain.devices).toHaveLength(1);
		expect(plain.devices[0]).toMatchObject({
			name: "Bathroom blind",
			room: { name: "Bathroom", floor: "Ground floor", outdoor: false },
		});
		expect(JSON.stringify(plain)).not.toContain("abcdabcdabcdabcd");
		expect(JSON.stringify(plain)).not.toContain("hunter2");
		const full = houseConfiguration.export(home, true);
		expect(full.devices[0]?.secret).toBe("abcdabcdabcdabcd");
		expect(full.melcloud?.password).toBe("hunter2");
		expect(
			houseConfigSchema.safeParse(JSON.parse(JSON.stringify(full))).success,
		).toBe(true);
	});

	test("imports into another home, then merges a second import without duplicates", () => {
		const home = HomeDTO.first();
		furnish(home);
		const file = houseConfigSchema.parse(
			JSON.parse(JSON.stringify(houseConfiguration.export(home, true))),
		);
		home.delete();
		setSetting("melcloud", null);
		const flat = HomeDTO.create("Flat");
		expect(houseConfiguration.import(flat, file)).toEqual({
			floors: 2,
			rooms: 3,
			devices: 1,
		});
		houseConfiguration.import(flat, file);
		expect(FloorDTO.inHome(flat.id)).toHaveLength(2);
		expect(RoomDTO.inHome(flat.id)).toHaveLength(3);
		const [blind] = DeviceDTO.inHome(flat.id);
		const bathroom = RoomDTO.inHome(flat.id).find(
			(room) => room.toJSON().id === blind?.toJSON().roomId,
		);
		expect(
			FloorDTO.find(bathroom?.toJSON().floorId ?? "", flat.id)?.toJSON().name,
		).toBe("Ground floor");
		expect(secrets.decrypt(blind?.encryptedLocalKey() ?? "")).toBe(
			"abcdabcdabcdabcd",
		);
		expect(getSetting("melcloud")?.email).toBe("ada@example.com");
	});

	test("carries the plan, its base floor and the pinned devices to another home", () => {
		const home = HomeDTO.first();
		furnish(home);
		const first = FloorDTO.inHome(home.id).find(
			(floor) => floor.toJSON().name === "First floor",
		);
		home.setPlanBase(first?.toJSON().id ?? null);
		const bathroom = RoomDTO.inHome(home.id)[0];
		const shape = [
			{ x: 12, y: 8, width: 6, height: 4 },
			{ x: 12, y: 12, width: 2, height: 2 },
		];
		bathroom?.place(shape);
		const door = DeviceDTO.upsert({
			homeId: home.id,
			kind: "zigbee-contact",
			name: "Front door",
			externalId: "0x00front",
		});
		door.setOptions({ pin: { place: "outside", x: 20.5, y: 9 } });
		const file = houseConfigSchema.parse(
			JSON.parse(JSON.stringify(houseConfiguration.export(home, false))),
		);
		home.delete();
		const flat = HomeDTO.create("Flat");
		houseConfiguration.import(flat, file);
		const imported = RoomDTO.inHome(flat.id).find(
			(room) => room.toJSON().name === bathroom?.toJSON().name,
		);
		expect(
			RoomDTO.inHome(flat.id).some(
				(room) => JSON.stringify(room.toJSON().plan) === JSON.stringify(shape),
			),
		).toBe(true);
		expect(imported).toBeDefined();
		const base = FloorDTO.inHome(flat.id).find(
			(floor) =>
				floor.toJSON().id === HomeDTO.find(flat.id)?.toJSON().planBaseFloorId,
		);
		expect(base?.toJSON().name).toBe("First floor");
		const pinned = DeviceDTO.inHome(flat.id).find(
			(device) => device.toJSON().name === "Front door",
		);
		expect(pinned?.options.pin).toEqual({ place: "outside", x: 20.5, y: 9 });
	});

	test("refuses anything that isn't a configuration", () => {
		expect(houseConfigSchema.safeParse({ floors: [] }).success).toBe(false);
		expect(
			houseConfigSchema.safeParse({
				format: "localassistant-house",
				version: 2,
			}).success,
		).toBe(false);
		const minimal = houseConfigSchema.parse({
			format: "localassistant-house",
			version: 1,
		});
		expect(minimal).toMatchObject({
			floors: [],
			rooms: [],
			devices: [],
			melcloud: null,
		});
	});
});
