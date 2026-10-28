import { describe, expect, test } from "bun:test";

import type { Cookies } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { signUpCookies } from "#lib/server/auth/sign-up-cookies.js";

function cookieJar(): Cookies {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name),
	} as unknown as Cookies;
}

describe("sign-up cookies", () => {
	test("walk the stepper from email to code to details and back", () => {
		const cookies = cookieJar();
		const url = new URL("https://app.test/auth/sign-up");
		expect(signUpCookies.currentStep(cookies)).toEqual({ step: "email" });
		signUpCookies.rememberPending(cookies, url, "a@b.c");
		expect(signUpCookies.currentStep(cookies)).toEqual({
			step: "code",
			email: "a@b.c",
		});
		signUpCookies.grantTicket(cookies, url, "a@b.c");
		expect(signUpCookies.currentStep(cookies)).toEqual({
			step: "details",
			email: "a@b.c",
		});
		signUpCookies.clear(cookies);
		expect(signUpCookies.currentStep(cookies)).toEqual({ step: "email" });
	});
});

describe("setup ticket", () => {
	test("is granted, read and cleared", () => {
		const cookies = cookieJar();
		expect(signUpCookies.hasSetupTicket(cookies)).toBe(false);
		signUpCookies.grantSetupTicket(
			cookies,
			new URL("http://localhost:3000/auth/setup"),
		);
		expect(signUpCookies.hasSetupTicket(cookies)).toBe(true);
		signUpCookies.clearSetupTicket(cookies);
		expect(signUpCookies.hasSetupTicket(cookies)).toBe(false);
	});
});

describe("adminFrom", () => {
	test("returns the admin or a 403 failure", () => {
		const admin = { id: "1", email: "admin@example.com", role: "admin" };
		expect(access.adminFrom({ user: admin } as unknown as App.Locals)).toBe(
			admin as never,
		);
		expect(
			access.adminFrom({
				user: { id: "2", email: "x@example.com" },
			} as unknown as App.Locals),
		).toMatchObject({ status: 403 });
		expect(
			access.adminFrom({ user: null } as unknown as App.Locals),
		).toMatchObject({
			status: 403,
		});
	});
});
