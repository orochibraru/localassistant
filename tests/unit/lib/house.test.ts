import { describe, expect, test } from "bun:test";

import { guessRoomIcon, houseGroups, placeOf, roomLabels } from "#lib/house.js";

const room = (id: string, floorId: string | null = null, outdoor = false) => ({
	id,
	name: id,
	icon: "door",
	floorId,
	outdoor,
});

describe("houseGroups", () => {
	test("rooms without floors are one group, outside its own", () => {
		expect(
			houseGroups([], [room("Kitchen"), room("Garage", null, true)]).map(
				(group) => [group.name, group.rooms.map((entry) => entry.id)],
			),
		).toEqual([
			["Rooms", ["Kitchen"]],
			["Outside", ["Garage"]],
		]);
	});

	test("floors come lowest first with their rooms, empty ones only when asked", () => {
		const floors = [
			{ id: "ground", name: "Ground floor", level: 0 },
			{ id: "attic", name: "Attic", level: 2 },
		];
		const rooms = [
			room("Living", "ground"),
			room("Bath", "ground"),
			room("Lost", "gone-floor"),
			room("Shed", "ground", true),
		];
		expect(
			houseGroups(floors, rooms).map((group) => [
				group.name,
				group.rooms.map((entry) => entry.id),
			]),
		).toEqual([
			["Ground floor", ["Bath", "Living"]],
			["Other rooms", ["Lost"]],
			["Outside", ["Shed"]],
		]);
		expect(houseGroups(floors, [], true).map((group) => group.id)).toEqual([
			"ground",
			"attic",
		]);
	});

	test("a room's place is its floor, outside or none", () => {
		expect(placeOf({ floorId: "ground", outdoor: false })).toBe("ground");
		expect(placeOf({ floorId: null, outdoor: true })).toBe("outside");
		expect(placeOf({ floorId: null, outdoor: false })).toBe("none");
	});
});

describe("guessRoomIcon", () => {
	test("reads English and French room names, accents or not", () => {
		const cases: [string, string | null][] = [
			["Living room", "living"],
			["Salon", "living"],
			["Chambre d'enfant", "kids"],
			["Chambre parentale", "bedroom"],
			["Salle de bain", "bathroom"],
			["Salle à manger", "dining"],
			["Cuisine", "kitchen"],
			["Bureau", "office"],
			["Abri voiture", "carport"],
			["Abri de jardin", "shed"],
			["Atelier", "workshop"],
			["Terrasse", "terrace"],
			["Jardin", "garden"],
			["Garage", "garage"],
			["Débarras", "storage"],
			["Entrée", "entrance"],
			["Placard", "storage"],
			["Studio de musique", "music"],
			["Music studio", "music"],
			["Salle de jeux", "playroom"],
			["Home cinema", "cinema"],
			["Guest bedroom", "guest"],
			["Dining Hall", "dining"],
			["Serre", "greenhouse"],
			["Pièce", null],
		];
		for (const [name, icon] of cases) {
			expect([name, guessRoomIcon(name)]).toEqual([name, icon]);
		}
	});
});

describe("roomLabels", () => {
	test("adds the floor or Outside only to names used twice", () => {
		const floors = [
			{ id: "ground", name: "Ground floor", level: 0 },
			{ id: "first", name: "First floor", level: 1 },
		];
		const labels = roomLabels(
			[
				room("a", "ground"),
				{ ...room("b", "first"), name: "Bathroom" },
				{ ...room("c", "ground"), name: "Bathroom" },
				{ ...room("d", null, true), name: "Shed" },
				{ ...room("e", null, false), name: "Shed" },
			],
			floors,
		);
		expect([...labels.values()]).toEqual([
			"a",
			"Bathroom, First floor",
			"Bathroom, Ground floor",
			"Shed, Outside",
			"Shed, no floor",
		]);
	});
});
