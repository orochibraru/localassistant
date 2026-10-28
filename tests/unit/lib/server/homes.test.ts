import { beforeEach, describe, expect, test } from "bun:test";

import type { Cookies } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import { setSetting } from "#lib/dto/setting.js";
import { homes } from "#lib/server/house/homes.js";

import { resetDatabase } from "../../database.js";

function cookieJar(): Cookies {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name),
	} as unknown as Cookies;
}

describe("homes", () => {
	beforeEach(resetDatabase);

	test("there is always a first home, and a browser only picks another once several are on", () => {
		const first = HomeDTO.first();
		expect(HomeDTO.first().id).toBe(first.id);
		const holiday = HomeDTO.create("Holiday home");
		const cookies = cookieJar();
		const url = new URL("https://home.example/");
		expect(homes.choose(cookies, url, holiday.id)).toBe(true);
		expect(homes.current(cookies).id).toBe(first.id);
		setSetting("multipleHomes", true);
		expect(homes.current(cookies).id).toBe(holiday.id);
		expect(homes.choose(cookies, url, "gone")).toBe(false);
		holiday.rename("Chalet");
		expect(HomeDTO.find(holiday.id)?.toJSON().name).toBe("Chalet");
		holiday.delete();
		expect(homes.current(cookies).id).toBe(first.id);
	});

	test("deleting a home takes its floors, rooms and devices, and leaves the others", () => {
		const main = HomeDTO.first();
		const other = HomeDTO.create("Flat");
		const floor = FloorDTO.create(other.id, "Ground floor", 0);
		RoomDTO.create(other.id, {
			name: "Kitchen",
			icon: "kitchen",
			floorId: floor.toJSON().id,
			outdoor: false,
		});
		DeviceDTO.upsert({
			homeId: other.id,
			kind: "melcloud-ata",
			name: "Flat heat pump",
			externalId: "90",
		});
		DeviceDTO.upsert({
			homeId: main.id,
			kind: "melcloud-ata",
			name: "Main heat pump",
			externalId: "91",
		});
		expect(DeviceDTO.inHome(other.id)).toHaveLength(1);
		other.delete();
		expect(FloorDTO.inHome(other.id)).toHaveLength(0);
		expect(RoomDTO.inHome(other.id)).toHaveLength(0);
		expect(DeviceDTO.inHome(other.id)).toHaveLength(0);
		expect(DeviceDTO.inHome(main.id).map((device) => device.name)).toEqual([
			"Main heat pump",
		]);
	});
});
