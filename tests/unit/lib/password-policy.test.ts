import { describe, expect, test } from "bun:test";

import { passwordRules, passwordScore } from "#lib/password-policy.js";

const failing = (password: string, email = "") =>
	passwordRules(password, email)
		.filter((rule) => !rule.passed)
		.map((rule) => rule.id);

describe("password policy", () => {
	test("needs length, variety, and not the email name", () => {
		expect(failing("short")).toEqual(["length", "variety"]);
		expect(failing("alllowercaseletters")).toEqual(["variety"]);
		expect(failing("Adalovelace-2026", "adalovelace@example.com")).toEqual([
			"email",
		]);
		expect(failing("Correct-Horse-42", "ada@example.com")).toEqual([]);
		expect(failing(`Aa1-${"x".repeat(130)}`)).toEqual(["max"]);
	});

	test("scores from weak to strong", () => {
		expect(passwordScore("")).toBe(0);
		expect(passwordScore("a")).toBe(1);
		expect(passwordScore("Correct-Horse4")).toBe(3);
		expect(passwordScore("Correct-Horse-Battery-42")).toBe(4);
	});
});
