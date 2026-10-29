import { beforeEach, describe, expect, test } from "bun:test";

import { AppearanceDTO, defaultAppearance } from "#lib/dto/appearance.js";
import { CodeChallengeDTO } from "#lib/dto/code-challenge.js";
import { InviteDTO } from "#lib/dto/invite.js";
import { PasskeyDTO } from "#lib/dto/passkey.js";
import {
	allSettings,
	getPluginSettings,
	getSetting,
	setPluginSettings,
	setSetting,
} from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { passkey, session, verification } from "#lib/server/db/schema.js";

import { createUser, resetDatabase } from "../../database.js";

describe("settings", () => {
	beforeEach(resetDatabase);

	test("falls back to defaults and stores values", () => {
		expect(allSettings()).toEqual({
			requireTwoFactor: false,
			requirePasskey: false,
			sessionDays: 7,
			smtp: null,
			mqtt: null,
			disabledPlugins: [],
			multipleHomes: false,
			passwordSignIn: true,
			passkeySignIn: true,
			magicLinkSignIn: false,
			emailCodeSignIn: false,
			ssoProviders: [],
			vapid: null,
			publicOrigin: null,
		});
		setSetting("requireTwoFactor", true);
		setSetting("requireTwoFactor", false);
		setSetting("requirePasskey", true);
		expect(getSetting("requireTwoFactor")).toBe(false);
		const connection = {
			homeId: null,
			values: { email: "a@b.c" },
			secrets: {},
		};
		setPluginSettings("melcloud", connection);
		setPluginSettings("melcloud", connection);
		expect(getPluginSettings("melcloud")).toEqual(connection);
		setPluginSettings("melcloud", null);
		expect(getPluginSettings("melcloud")).toBeNull();
		expect(getSetting("requirePasskey")).toBe(true);
	});
});

describe("InviteDTO", () => {
	beforeEach(resetDatabase);

	test("finds a pending invite by token, once", () => {
		const admin = createUser("admin", "Admin");
		const { token } = InviteDTO.create("friend@example.com", admin.id);
		const found = InviteDTO.findByToken(token);
		expect(found?.email).toBe("friend@example.com");
		expect(found?.toJSON().invitedByName).toBe("Admin");
		expect(InviteDTO.pendingCount()).toBe(1);
		found?.accept();
		expect(InviteDTO.findByToken(token)).toBeUndefined();
		expect(InviteDTO.findByToken("wrong")).toBeUndefined();
		expect(InviteDTO.pendingCount()).toBe(0);
	});

	test("a new invite replaces the pending one, and revoke deletes it", () => {
		const admin = createUser("admin");
		const first = InviteDTO.create("friend@example.com", admin.id);
		const second = InviteDTO.create("friend@example.com", admin.id);
		expect(InviteDTO.findByToken(first.token)).toBeUndefined();
		expect(InviteDTO.list()).toHaveLength(1);
		InviteDTO.revoke(second.invite.toJSON().id);
		expect(InviteDTO.list()).toHaveLength(0);
	});
});

describe("UserDTO", () => {
	beforeEach(resetDatabase);

	test("lists, counts, verifies, signs out and deletes", () => {
		const ada = createUser("ada", "Ada");
		createUser("grace", "Grace");
		expect(UserDTO.count()).toBe(2);
		expect(UserDTO.emailExists("ada@example.com")).toBe(true);
		expect(UserDTO.idForEmail("grace@example.com")).toBe("grace");
		expect(UserDTO.idForEmail("nobody@example.com")).toBeUndefined();
		expect(UserDTO.list().map((user) => user.toJSON())).toContainEqual(
			expect.objectContaining({
				id: "ada",
				twoFactorEnabled: false,
				passkeyCount: 0,
			}),
		);
		UserDTO.setRole(ada.id, "admin");
		expect(
			UserDTO.list()
				.find((entry) => entry.toJSON().id === ada.id)
				?.toJSON().role,
		).toBe("admin");
		UserDTO.markEmailVerified(ada.id);
		databaseConnection
			.get()
			.insert(session)
			.values({
				id: "s1",
				token: "t1",
				userId: ada.id,
				expiresAt: new Date(Date.now() + 60_000),
			})
			.run();
		UserDTO.revokeSessions(ada.id);
		expect(databaseConnection.get().select().from(session).all()).toHaveLength(
			0,
		);
		UserDTO.delete(ada.id);
		expect(UserDTO.count()).toBe(1);
		expect(PasskeyDTO.forUser("grace")).toEqual([]);
	});
});

function verifyCode(email: string, code: string): boolean {
	return CodeChallengeDTO.find(email)?.verify(code) ?? false;
}

describe("CodeChallengeDTO", () => {
	beforeEach(resetDatabase);

	test("verifies the right code once and enforces the resend cooldown", () => {
		const code = CodeChallengeDTO.start("new@example.com");
		expect(() => CodeChallengeDTO.start("new@example.com")).toThrow(
			"Wait a minute",
		);
		expect(
			verifyCode("new@example.com", "000000" === code ? "111111" : "000000"),
		).toBe(false);
		expect(verifyCode("new@example.com", code)).toBe(true);
		expect(verifyCode("new@example.com", code)).toBe(false);
	});

	test("drops the challenge after five wrong tries", () => {
		CodeChallengeDTO.start("new@example.com", "123456");
		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect(verifyCode("new@example.com", "654321")).toBe(false);
		}
		expect(
			databaseConnection.get().select().from(verification).all(),
		).toHaveLength(0);
		expect(verifyCode("new@example.com", "123456")).toBe(false);
	});
});

describe("AppearanceDTO", () => {
	beforeEach(resetDatabase);

	test("appearance defaults until saved", () => {
		const ada = createUser("ada");
		expect(AppearanceDTO.forUser(ada.id).toJSON()).toEqual(defaultAppearance);
		const custom = {
			...defaultAppearance,
			accent: "rose" as const,
			darkVariant: "amoled" as const,
		};
		AppearanceDTO.save(ada.id, custom);
		AppearanceDTO.save(ada.id, custom);
		expect(AppearanceDTO.forUser(ada.id).toJSON()).toEqual(custom);
	});
});

describe("PasskeyDTO", () => {
	beforeEach(resetDatabase);

	test("lists a user's passkeys", () => {
		const ada = createUser("ada");
		databaseConnection
			.get()
			.insert(passkey)
			.values({
				id: "p1",
				name: "Laptop",
				publicKey: "key",
				userId: ada.id,
				credentialID: "c1",
				counter: 0,
				deviceType: "multiDevice",
				backedUp: true,
				createdAt: new Date(),
			})
			.run();
		expect(PasskeyDTO.forUser(ada.id).map((entry) => entry.toJSON())).toEqual([
			expect.objectContaining({
				id: "p1",
				name: "Laptop",
				deviceType: "multiDevice",
			}),
		]);
	});
});
