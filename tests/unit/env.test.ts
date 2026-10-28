import { describe, expect, test } from "bun:test";

import { workerMessages } from "#lib/server/worker/messages.js";

import { variables } from "../../src/env.ts";

async function parse(
	name: keyof typeof variables,
	value: string | undefined,
): Promise<unknown> {
	const result = await variables[name].schema["~standard"].validate(value);
	return "issues" in result && result.issues
		? { issues: result.issues.map((issue) => issue.message) }
		: result.value;
}

describe("env.ts", () => {
	test("AUTH_SECRET is required and long", async () => {
		expect(await parse("AUTH_SECRET", "short")).toMatchObject({
			issues: [expect.stringContaining("32 characters")],
		});
		expect(await parse("AUTH_SECRET", "x".repeat(44))).toBe("x".repeat(44));
	});

	test("optional values turn empty into undefined and URLs are checked", async () => {
		expect(await parse("ORIGIN", "")).toBeUndefined();
		expect(await parse("ORIGIN", "http://192.168.1.10:3000")).toBe(
			"http://192.168.1.10:3000",
		);
		expect(await parse("ORIGIN", "ftp://nope")).toHaveProperty("issues");
		expect(await parse("APP_VERSION", "  ")).toBeUndefined();
	});

	test("SIGN_IN_METHODS lists known methods or is left out", async () => {
		expect(await parse("SIGN_IN_METHODS", undefined)).toBeUndefined();
		expect(await parse("SIGN_IN_METHODS", "")).toBeUndefined();
		expect(await parse("SIGN_IN_METHODS", "password, passkey")).toEqual([
			"password",
			"passkey",
		]);
		expect(await parse("SIGN_IN_METHODS", "password,sms")).toHaveProperty(
			"issues",
		);
	});

	test("defaults, enums and integers", async () => {
		expect(await parse("DATABASE_PATH", undefined)).toBe(
			"./data/localassistant.sqlite",
		);
		expect(await parse("LOG_LEVEL", undefined)).toBe("info");
		expect(await parse("LOG_LEVEL", "loud")).toHaveProperty("issues");
		expect(await parse("WORKER_CONCURRENCY", undefined)).toBe(2);
		expect(await parse("WORKER_CONCURRENCY", " 4 ")).toBe(4);
		expect(await parse("WORKER_CONCURRENCY", "0")).toHaveProperty("issues");
		expect(await parse("WORKER_POLL_INTERVAL_MS", "abc")).toHaveProperty(
			"issues",
		);
	});
});

describe("config helpers", () => {
	test("worker IPC messages are recognised", () => {
		expect(workerMessages.isReady({ type: "ready" })).toBe(true);
		expect(workerMessages.isReady("ready")).toBe(false);
		expect(workerMessages.isConfig({ type: "config", config: {} })).toBe(true);
		expect(workerMessages.isConfig({ type: "config" })).toBe(false);
		expect(workerMessages.isConfig(null)).toBe(false);
	});
});
