import { describe, expect, test } from "bun:test";

import {
	describeDistance,
	distanceMetres,
	moveCard,
	readAgo,
	refill,
	timeLeft,
} from "#lib/devices.js";
import {
	cardSizeOf,
	type KindCatalog,
	kindInfo,
	sortCards,
	withCard,
} from "#lib/plugins.js";

describe("readAgo", () => {
	const now = Date.parse("2026-10-28T12:00:00Z");
	const ago = (seconds: number) => new Date(now - seconds * 1000);

	test("says when a device was last read, in words", () => {
		expect(readAgo(null, now)).toBeNull();
		expect(readAgo(ago(10), now)).toBe("just now");
		expect(readAgo(ago(60), now)).toBe("1 minute ago");
		expect(readAgo(ago(150), now)).toBe("3 minutes ago");
		expect(readAgo(ago(2 * 3600), now)).toBe("2 hours ago");
		expect(readAgo(ago(26 * 3600), now)).toBe("yesterday");
		expect(readAgo(ago(3 * 86_400), now)).toBe("3 days ago");
	});
});

describe("timeLeft", () => {
	test("says a print's time left in hours and minutes", () => {
		expect(timeLeft(12)).toBe("12 min");
		expect(timeLeft(125)).toBe("2 h 05 min");
		expect(timeLeft(60)).toBe("1 h 00 min");
	});
});

describe("distances", () => {
	test("measure along the Earth and say it in words", () => {
		const clermont = { latitude: 45.7772, longitude: 3.087 };
		const paris = { latitude: 48.8566, longitude: 2.3522 };
		expect(Math.round(distanceMetres(clermont, paris) / 1000)).toBe(347);
		expect(distanceMetres(clermont, clermont)).toBe(0);
		expect(describeDistance(40)).toBe("At home");
		expect(describeDistance(640)).toBe("640 m away");
		expect(describeDistance(3456)).toBe("3.5 km away");
		expect(describeDistance(347_000)).toBe("347 km away");
	});
});

describe("arranging cards", () => {
	const card = (id: string, kind: string) => ({ id, kind, name: id });
	const info = (
		order: number,
		card: "switch" | "climate" | "cover" | "vacuum",
	) => ({
		plugin: "test",
		label: card,
		card,
		icon: "puzzle" as const,
		size: card === "vacuum" ? ("large" as const) : ("medium" as const),
		order,
		houseMeter: false,
	});
	const catalog: KindCatalog = {
		"zigbee-switch": info(3, "switch"),
		"melcloud-ata": info(0, "climate"),
		"tuya-cover": info(1, "cover"),
		"dreame-vacuum": info(3, "vacuum"),
	};

	test("follows the account's order, the rest by kind and name", () => {
		const cards = [
			card("lamp", "zigbee-switch"),
			card("pump", "melcloud-ata"),
			card("blind", "tuya-cover"),
			card("robot", "dreame-vacuum"),
		];
		expect(sortCards(cards, [], catalog).map((entry) => entry.id)).toEqual([
			"pump",
			"blind",
			"lamp",
			"robot",
		]);
		expect(
			sortCards(cards, ["robot", "lamp"], catalog).map((entry) => entry.id),
		).toEqual(["robot", "lamp", "pump", "blind"]);
		expect(cardSizeOf(undefined, cards[3] ?? card("x", "x"), catalog)).toBe(
			"large",
		);
		expect(cardSizeOf({ robot: "small" }, card("robot", "x"), catalog)).toBe(
			"small",
		);
		expect(kindInfo(catalog, "gone").label).toBe("Unknown device");
		expect(
			withCard(catalog, cards, "cover", "climate").map((entry) => entry.id),
		).toEqual(["pump", "blind"]);
	});

	test("moves a card onto another's place and puts a section back in its slots", () => {
		expect(moveCard(["a", "b", "c", "d"], "a", "c")).toEqual([
			"b",
			"c",
			"a",
			"d",
		]);
		expect(moveCard(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
		expect(moveCard(["a", "b"], "z", "a")).toEqual(["a", "b"]);
		expect(refill(["a", "x", "b", "y", "c"], ["c", "a", "b"])).toEqual([
			"c",
			"x",
			"a",
			"y",
			"b",
		]);
	});
});
