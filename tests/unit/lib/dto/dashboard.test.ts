import { beforeEach, describe, expect, test } from "bun:test";

import { DashboardDTO } from "#lib/dto/dashboard.js";
import { dashboardFormSchema } from "#lib/server/validation/dashboard.js";

import { createUser, resetDatabase } from "../../database.js";

describe("dashboards", () => {
	beforeEach(resetDatabase);

	test("belong to the account that made them", () => {
		const ada = createUser("ada", "Ada").id;
		const bob = createUser("bob", "Bob").id;
		const bedtime = DashboardDTO.create(ada, {
			name: "Bedtime",
			sections: [{ type: "heading", text: "Upstairs" }, { type: "people" }],
		});
		DashboardDTO.create(ada, { name: "All", sections: [{ type: "weather" }] });
		expect(DashboardDTO.forUser(ada).map((entry) => entry.name)).toEqual([
			"All",
			"Bedtime",
		]);
		expect(DashboardDTO.forUser(bob)).toEqual([]);
		expect(DashboardDTO.find(bedtime.id, bob)).toBeUndefined();
		const found = DashboardDTO.find(bedtime.id, ada);
		expect(found?.sections).toEqual([
			{ type: "heading", text: "Upstairs" },
			{ type: "people" },
		]);
		found?.update({
			name: "Night",
			sections: [{ type: "graph", deviceId: "d", range: "week" }],
		});
		expect(DashboardDTO.find(bedtime.id, ada)?.toJSON()).toMatchObject({
			name: "Night",
			sections: [{ type: "graph", deviceId: "d", range: "week" }],
		});
		expect(DashboardDTO.find(bedtime.id, ada)?.name).toBe("Night");
		found?.delete();
		expect(DashboardDTO.forUser(ada)).toHaveLength(1);
	});

	test("the form takes every section and refuses an empty dashboard", () => {
		const definition = {
			name: "Kitchen",
			sections: [
				{ type: "heading", text: "Cooking" },
				{ type: "devices", deviceIds: ["a", "b"] },
				{ type: "scenes", sceneIds: ["s"] },
				{ type: "weather" },
				{ type: "people" },
				{ type: "graph", deviceId: "a", range: "day" },
			],
		};
		expect(
			dashboardFormSchema.safeParse({ definition: JSON.stringify(definition) })
				.success,
		).toBe(true);
		expect(
			dashboardFormSchema.safeParse({
				definition: JSON.stringify({ ...definition, sections: [] }),
			}).success,
		).toBe(false);
		expect(
			dashboardFormSchema.safeParse({
				definition: JSON.stringify({
					name: "x",
					sections: [{ type: "devices", deviceIds: [] }],
				}),
			}).success,
		).toBe(false);
		expect(dashboardFormSchema.safeParse({ definition: "{" }).success).toBe(
			false,
		);
	});
});
