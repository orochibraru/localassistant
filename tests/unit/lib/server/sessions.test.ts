import { beforeEach, describe, expect, test } from "bun:test";

import { SessionDTO } from "#lib/dto/session.js";
import { setSetting } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import type { Session } from "#lib/server/auth/auth.js";
import { securityPolicy } from "#lib/server/auth/security-policy.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { session } from "#lib/server/db/schema.js";

import { createUser, resetDatabase } from "../../database.js";

function createSession(id: string, userId = "ada", updatedAt = new Date()) {
	databaseConnection
		.get()
		.insert(session)
		.values({
			id,
			userId,
			token: `token-${id}`,
			expiresAt: new Date(Date.now() + 86_400_000),
			updatedAt,
		})
		.run();
}

function current(id: string): Session {
	return {
		session: { id, userId: "ada", createdAt: new Date() },
		user: { id: "ada", twoFactorEnabled: false },
	} as unknown as Session;
}

describe("sessions", () => {
	beforeEach(() => {
		resetDatabase();
		createUser("ada");
		createUser("grace", "Grace");
	});

	test("lists, signs out one and signs out the others, only for their owner", () => {
		createSession("one", "ada", new Date(Date.now() - 2000));
		createSession("two", "ada", new Date(Date.now() + 1000));
		createSession("three");
		createSession("hers", "grace");
		expect(SessionDTO.forUser("ada").map((entry) => entry.toJSON().id)[0]).toBe(
			"two",
		);
		expect(SessionDTO.revokeForUser("hers", "ada")).toBe(false);
		expect(SessionDTO.revokeForUser("three", "ada")).toBe(true);
		SessionDTO.revokeOthers("ada", "one");
		expect(SessionDTO.forUser("ada").map((entry) => entry.toJSON().id)).toEqual(
			["one"],
		);
		expect(SessionDTO.forUser("grace")).toHaveLength(1);
	});
});

describe("session gate and admin guards", () => {
	beforeEach(() => {
		resetDatabase();
		createUser("ada");
	});

	test("lets a plain session through and gates one missing a required factor", () => {
		expect(
			securityPolicy.sessionGate(current("one"), "/(protected)"),
		).toBeUndefined();
		setSetting("requireTwoFactor", true);
		setSetting("requirePasskey", true);
		expect(securityPolicy.missingFactors({ id: "ada" })).toEqual([
			"two-factor",
			"passkey",
		]);
		expect(securityPolicy.sessionGate(current("one"), "/(protected)")).toEqual({
			reason: "factors",
			missing: ["two-factor", "passkey"],
		});
		expect(
			securityPolicy.sessionGate(
				current("one"),
				"/(protected)/account/security",
			),
		).toBeUndefined();
	});

	test("a recent sign-in lasts 15 minutes, and admin grants need one", () => {
		const now = Date.now();
		expect(
			securityPolicy.signedInRecently(
				{ createdAt: new Date(now - 60_000) },
				now,
			),
		).toBe(true);
		expect(
			securityPolicy.signedInRecently(
				{ createdAt: new Date(now - 16 * 60_000) },
				now,
			),
		).toBe(false);
		const admin = { id: "ada", role: "admin" } as unknown as Session["user"];
		expect(access.isAdmin(admin)).toBe(true);
		expect(access.adminFrom({ user: admin } as unknown as App.Locals)).toBe(
			admin,
		);
		expect(
			access.adminFrom({
				user: { id: "grace", role: "member" },
			} as unknown as App.Locals),
		).toMatchObject({ status: 403 });
		expect(
			access.recentAdminFrom({
				user: admin,
				session: { createdAt: new Date() },
			} as unknown as App.Locals),
		).toBe(admin);
		expect(
			access.recentAdminFrom({
				user: admin,
				session: { createdAt: new Date(now - 3_600_000) },
			} as unknown as App.Locals),
		).toMatchObject({ status: 403 });
	});
});
