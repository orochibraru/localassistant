import { beforeEach, describe, expect, test } from "bun:test";

import { CardSizeDTO } from "#lib/dto/card-size.js";
import { DeviceDTO } from "#lib/dto/device.js";

import { createUser, homeId, resetDatabase } from "../../database.js";

describe("CardSizeDTO", () => {
	beforeEach(resetDatabase);

	test("keeps each account's card sizes apart and replaces a size", () => {
		const ada = createUser("ada");
		const grace = createUser("grace", "Grace");
		const robot = DeviceDTO.upsert({
			kind: "dreame-vacuum",
			homeId: homeId(),
			name: "X30",
			externalId: "123456",
		});
		const id = robot.toJSON().id;
		expect(CardSizeDTO.forUser(ada.id)).toEqual({});
		CardSizeDTO.save(ada.id, id, "small");
		CardSizeDTO.save(ada.id, id, "large");
		CardSizeDTO.save(grace.id, id, "medium");
		expect(CardSizeDTO.forUser(ada.id)).toEqual({ [id]: "large" });
		expect(CardSizeDTO.forUser(grace.id)).toEqual({ [id]: "medium" });
		robot.delete();
		expect(CardSizeDTO.forUser(ada.id)).toEqual({});
	});
});
