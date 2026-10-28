import { describe, expect, test } from "bun:test";

import { authService } from "#lib/server/auth/auth.js";

describe("mcpResource", () => {
	test("serves AI apps over HTTPS, or localhost while developing", () => {
		expect(authService.mcpResource("https://home.example")).toBe(
			"https://home.example/mcp",
		);
		expect(authService.mcpResource("http://localhost:5173")).toBe(
			"http://localhost:5173/mcp",
		);
		expect(authService.mcpResource("http://192.168.1.20:3000")).toBeUndefined();
		expect(authService.mcpResource(undefined)).toBeUndefined();
	});
});
