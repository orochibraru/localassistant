import { beforeEach, describe, expect, test } from "bun:test";

import { hasPassword } from "#lib/dto/account.js";
import { UserDTO } from "#lib/dto/user.js";
import { databaseConnection } from "#lib/server/db/database.js";
import {
	account,
	passkey,
	session,
	twoFactor,
	user,
	verification,
} from "#lib/server/db/schema.js";

import { createUser, resetDatabase } from "../../database.js";

describe("UserDTO account changes", () => {
	beforeEach(resetDatabase);

	test("people lists every account by name", () => {
		createUser("zed", "Zed");
		createUser("ada", "Ada");
		expect(UserDTO.people()).toEqual([
			{ id: "ada", name: "Ada" },
			{ id: "zed", name: "Zed" },
		]);
	});

	test("resetFactors removes the authenticator, passkeys and sessions", () => {
		const ada = createUser("ada");
		const database = databaseConnection.get();
		database.update(user).set({ twoFactorEnabled: true }).run();
		database
			.insert(twoFactor)
			.values({ id: "totp", secret: "s", backupCodes: "[]", userId: ada.id })
			.run();
		database
			.insert(passkey)
			.values({
				id: "key",
				publicKey: "p",
				userId: ada.id,
				credentialID: "c",
				counter: 0,
				deviceType: "singleDevice",
				backedUp: false,
			})
			.run();
		database
			.insert(session)
			.values({
				id: "s",
				token: "t",
				userId: ada.id,
				expiresAt: new Date(Date.now() + 60_000),
			})
			.run();
		UserDTO.resetFactors(ada.id);
		expect(UserDTO.twoFactorEnabled(ada.id)).toBe(false);
		expect(database.select().from(twoFactor).all()).toEqual([]);
		expect(database.select().from(passkey).all()).toEqual([]);
		expect(database.select().from(session).all()).toEqual([]);
	});

	test("changeEmail moves the account and counts the address as verified", () => {
		const ada = createUser("ada");
		UserDTO.changeEmail(ada.id, "new@example.com");
		expect(UserDTO.idForEmail("new@example.com")).toBe(ada.id);
		expect(
			databaseConnection.get().select().from(user).get()?.emailVerified,
		).toBe(true);
	});

	test("adminCount counts admins only", () => {
		createUser("ada");
		const grace = createUser("grace");
		expect(UserDTO.adminCount()).toBe(0);
		UserDTO.setRole(grace.id, "admin");
		expect(UserDTO.adminCount()).toBe(1);
	});

	test("emailForPasswordReset finds a live token's account only", () => {
		const ada = createUser("ada");
		databaseConnection
			.get()
			.insert(verification)
			.values([
				{
					id: "live",
					identifier: "reset-password:live",
					value: ada.id,
					expiresAt: new Date(Date.now() + 60_000),
				},
				{
					id: "old",
					identifier: "reset-password:old",
					value: ada.id,
					expiresAt: new Date(Date.now() - 60_000),
				},
			])
			.run();
		expect(UserDTO.emailForPasswordReset("live")).toBe("ada@example.com");
		expect(UserDTO.emailForPasswordReset("old")).toBeUndefined();
		expect(UserDTO.emailForPasswordReset("nope")).toBeUndefined();
	});

	test("hasPassword is true for a credential account with a password", () => {
		const ada = createUser("ada");
		expect(hasPassword(ada.id)).toBe(false);
		databaseConnection
			.get()
			.insert(account)
			.values({
				id: "credential",
				accountId: ada.id,
				providerId: "credential",
				userId: ada.id,
				password: "hash",
			})
			.run();
		expect(hasPassword(ada.id)).toBe(true);
	});
});
