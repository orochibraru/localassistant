import { beforeEach, describe, expect, test } from "bun:test";

import { AiAppDTO, aiAppLifetimeMs } from "#lib/dto/ai-app.js";
import { databaseConnection } from "#lib/server/db/database.js";
import {
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
} from "#lib/server/db/schema.js";

import { createUser, resetDatabase } from "../../database.js";

function allow(userId: string, clientId: string, approvedAt: Date): void {
	const now = new Date();
	databaseConnection
		.get()
		.insert(oauthClient)
		.values({
			id: clientId,
			clientId,
			name: "Claude",
			redirectUris: "[]",
		})
		.onConflictDoNothing()
		.run();
	databaseConnection
		.get()
		.insert(oauthConsent)
		.values({
			id: `${userId}-${clientId}`,
			clientId,
			userId,
			scopes: "[]",
			createdAt: approvedAt,
			updatedAt: approvedAt,
		})
		.run();
	databaseConnection
		.get()
		.insert(oauthRefreshToken)
		.values({
			id: `${userId}-${clientId}-refresh`,
			token: `${userId}-${clientId}-refresh`,
			clientId,
			userId,
			scopes: "[]",
			createdAt: now,
			expiresAt: new Date(now.getTime() + 86_400_000),
		})
		.run();
	databaseConnection
		.get()
		.insert(oauthAccessToken)
		.values({
			id: `${userId}-${clientId}-access`,
			token: `${userId}-${clientId}-access`,
			clientId,
			userId,
			refreshId: `${userId}-${clientId}-refresh`,
			scopes: "[]",
			createdAt: now,
			expiresAt: new Date(now.getTime() + 3_600_000),
		})
		.run();
}

function tokensOf(userId: string): number {
	return [oauthAccessToken, oauthRefreshToken].reduce(
		(total, table) =>
			total +
			databaseConnection
				.get()
				.select()
				.from(table)
				.all()
				.filter((row) => row.userId === userId).length,
		0,
	);
}

describe("AiAppDTO", () => {
	beforeEach(resetDatabase);

	test("lists the apps someone allowed, with when access ends", () => {
		const ada = createUser("ada");
		const approvedAt = new Date("2026-10-01T10:00:00Z");
		allow(ada.id, "claude", approvedAt);
		expect(AiAppDTO.forUser(ada.id).map((app) => app.toJSON())).toEqual([
			{
				clientId: "claude",
				name: "Claude",
				uri: null,
				approvedAt,
				expiresAt: new Date(approvedAt.getTime() + aiAppLifetimeMs),
			},
		]);
	});

	test("lets an app in for 30 days, then cuts it off with its tokens", () => {
		const ada = createUser("ada");
		const grace = createUser("grace");
		const now = new Date("2026-10-27T10:00:00Z");
		allow(ada.id, "claude", new Date(now.getTime() - 29 * 86_400_000));
		allow(grace.id, "claude", new Date(now.getTime() - 31 * 86_400_000));

		expect(AiAppDTO.allowed(ada.id, "claude", now)).toBe(true);
		expect(AiAppDTO.allowed(ada.id, "chatgpt", now)).toBe(false);
		expect(AiAppDTO.allowed(grace.id, "claude", now)).toBe(false);
		expect(AiAppDTO.forUser(grace.id)).toEqual([]);
		expect(tokensOf(grace.id)).toBe(0);
		expect(tokensOf(ada.id)).toBe(2);
	});

	test("revoking one person's app leaves everyone else's alone", () => {
		const ada = createUser("ada");
		const grace = createUser("grace");
		allow(ada.id, "claude", new Date());
		allow(grace.id, "claude", new Date());

		AiAppDTO.revoke(ada.id, "claude");
		expect(AiAppDTO.allowed(ada.id, "claude")).toBe(false);
		expect(tokensOf(ada.id)).toBe(0);
		expect(AiAppDTO.allowed(grace.id, "claude")).toBe(true);
	});
});
