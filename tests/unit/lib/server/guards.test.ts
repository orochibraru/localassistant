import { beforeEach, describe, expect, test } from "bun:test";

import { access } from "#lib/server/auth/access.js";

import { createUser, resetDatabase } from "../../database.js";

function redirectOf(url: string): unknown {
	try {
		access.redirectToSignIn(new URL(url));
	} catch (thrown) {
		return thrown;
	}
	return undefined;
}

describe("guards", () => {
	beforeEach(resetDatabase);

	test("a fresh instance sends everyone to setup", () => {
		expect(redirectOf("https://example.com/groups")).toMatchObject({
			status: 303,
			location: "/auth/setup",
		});
	});

	test("redirectToSignIn keeps the requested path", () => {
		createUser("ada");
		expect(redirectOf("https://example.com/groups?tab=1")).toMatchObject({
			status: 303,
			location: "/auth/sign-in?redirectTo=%2Fgroups%3Ftab%3D1",
		});
	});

	test("safeRedirectTarget only allows local paths", () => {
		expect(
			access.safeRedirectTarget(
				new URL("https://example.com/auth/sign-in?redirectTo=/account"),
			),
		).toBe("/account");
		expect(
			access.safeRedirectTarget(
				new URL("https://example.com/auth/sign-in?redirectTo=//evil.test"),
			),
		).toBe("/");
		for (const sneaky of [
			"/%5Cevil.test",
			"/%09/evil.test",
			"https://evil.test",
		]) {
			expect(
				access.safeRedirectTarget(
					new URL(`https://example.com/auth/sign-in?redirectTo=${sneaky}`),
				),
			).toBe("/");
		}
		expect(
			access.safeRedirectTarget(
				new URL("https://example.com/auth/sign-in?redirectTo=/groups%3Fq%3Da"),
			),
		).toBe("/groups?q=a");
		expect(
			access.safeRedirectTarget(new URL("https://example.com/auth/sign-in")),
		).toBe("/");
	});
});
