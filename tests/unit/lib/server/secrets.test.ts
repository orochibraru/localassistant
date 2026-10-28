import { describe, expect, test } from "bun:test";

import { secrets } from "#lib/server/core/secrets.js";

describe("secrets", () => {
	test("encrypts and decrypts, and refuses a tampered value", () => {
		const stored = secrets.encrypt("smtp-password");
		expect(stored).not.toContain("smtp-password");
		expect(secrets.decrypt(stored)).toBe("smtp-password");
		const [iv, body, tag] = stored.split(".");
		expect(() => secrets.decrypt(`${iv}.${body}x.${tag}`)).toThrow();
		expect(() => secrets.decrypt("broken")).toThrow("Malformed");
	});

	test("tokens and codes look right and hash stably", () => {
		expect(secrets.randomToken()).toMatch(/^[\w-]{43}$/);
		expect(secrets.randomCode()).toMatch(/^\d{6}$/);
		expect(secrets.hashToken("abc")).toBe(secrets.hashToken("abc"));
		expect(secrets.hashToken("abc")).not.toBe(secrets.hashToken("xyz"));
	});

	test("signed payloads check purpose, signature and expiry", () => {
		const signed = secrets.sign({ email: "a@b.c" }, "ticket", 60_000);
		expect(secrets.verify(signed, "ticket")).toMatchObject({ email: "a@b.c" });
		expect(secrets.verify(signed, "other")).toBeUndefined();
		expect(secrets.verify(`${signed}x`, "ticket")).toBeUndefined();
		expect(secrets.verify(undefined, "ticket")).toBeUndefined();
		expect(
			secrets.verify(secrets.sign({}, "ticket", -1), "ticket"),
		).toBeUndefined();
	});
});
