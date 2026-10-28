import { describe, expect, test } from "bun:test";

const root = "src/routes/(protected)/+layout.server.ts";

describe("protected loads", () => {
	test("every one awaits parent(), since a client navigation can skip the layouts", async () => {
		const unguarded: string[] = [];
		for await (const file of new Bun.Glob(
			"src/routes/(protected)/**/+{page,layout}.server.ts",
		).scan(".")) {
			const text = await Bun.file(file).text();
			if (
				file !== root &&
				/export const load\b/.test(text) &&
				!/\bparent\(\)/.test(text)
			) {
				unguarded.push(file);
			}
		}
		expect(unguarded).toEqual([]);
	});
});
