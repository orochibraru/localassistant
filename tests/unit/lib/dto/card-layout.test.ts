import { beforeEach, describe, expect, test } from "bun:test";

import { CardLayoutDTO } from "#lib/dto/card-layout.js";

import { createUser, resetDatabase } from "../../database.js";

describe("CardLayoutDTO", () => {
	beforeEach(resetDatabase);

	test("keeps each account's order and brief cards", () => {
		const ada = createUser("ada");
		expect(CardLayoutDTO.forUser(ada.id)).toEqual({ order: [], brief: [] });
		CardLayoutDTO.arrange(ada.id, ["b", "a"]);
		CardLayoutDTO.showDetails(ada.id, "linky", false);
		CardLayoutDTO.showDetails(ada.id, "linky", false);
		expect(CardLayoutDTO.forUser(ada.id)).toEqual({
			order: ["b", "a"],
			brief: ["linky"],
		});
		CardLayoutDTO.showDetails(ada.id, "linky", true);
		expect(CardLayoutDTO.forUser(ada.id).brief).toEqual([]);
		expect(CardLayoutDTO.forUser("grace")).toEqual({ order: [], brief: [] });
	});
});
