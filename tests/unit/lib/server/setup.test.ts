import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { instanceSetup, SetupError } from "#lib/server/auth/setup.js";
import { configuration } from "#lib/server/core/config.js";

import { createUser, resetDatabase } from "../../database.js";

function logged(run: () => void): string {
	const output = spyOn(console, "error").mockImplementation(() => {});
	const info = spyOn(console, "log").mockImplementation(() => {});
	run();
	const lines = [...output.mock.calls, ...info.mock.calls]
		.map((call) => call.map(String).join(" "))
		.join("\n");
	output.mockRestore();
	info.mockRestore();
	return lines;
}

describe("instance setup", () => {
	beforeEach(resetDatabase);
	afterEach(() => {
		configuration.get().logLevel = "error";
	});

	test("is needed until the first account exists", () => {
		expect(instanceSetup.needed()).toBe(true);
		createUser("ada");
		expect(instanceSetup.needed()).toBe(false);
	});

	test("the code printed in the log verifies once", () => {
		configuration.get().logLevel = "info";
		const line = logged(() => instanceSetup.issueCode());
		const code = /Setup code: (\d{3}) (\d{3})/.exec(line);
		expect(code).not.toBeNull();
		expect(
			instanceSetup.verifyCode(
				"000000" === `${code?.[1]}${code?.[2]}` ? "111111" : "000000",
			),
		).toBe(false);
		expect(instanceSetup.verifyCode(`${code?.[1]}${code?.[2]}`)).toBe(true);
		expect(instanceSetup.verifyCode(`${code?.[1]}${code?.[2]}`)).toBe(false);
	});

	test("refuses a new code within the resend cooldown", () => {
		logged(() => instanceSetup.issueCode());
		expect(() => instanceSetup.issueCode()).toThrow(SetupError);
	});

	test("announces itself only on a fresh instance", () => {
		configuration.get().logLevel = "info";
		expect(logged(() => instanceSetup.announce())).toContain("Setup code");
		expect(logged(() => instanceSetup.announce())).toContain(
			"open /auth/setup",
		);
		createUser("ada");
		expect(logged(() => instanceSetup.announce())).toBe("");
	});
});
