import { describe, expect, test } from "bun:test";

import { keepRedirect } from "#lib/redirect-target.js";

describe("keepRedirect", () => {
	test("carries redirectTo into a named action", () => {
		expect(
			keepRedirect(
				"?/password",
				new URL("https://example.com/auth/sign-in?redirectTo=/groups/1"),
			),
		).toBe("?/password&redirectTo=%2Fgroups%2F1");
		expect(
			keepRedirect("?/password", new URL("https://example.com/auth/sign-in")),
		).toBe("?/password");
	});
});
