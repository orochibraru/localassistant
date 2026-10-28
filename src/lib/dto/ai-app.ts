import { and, desc, eq } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import {
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
} from "#lib/server/db/schema.js";

export const aiAppLifetimeMs = 30 * 86_400_000;

export interface AiApp {
	clientId: string;
	name: string;
	uri: string | null;
	approvedAt: Date;
	expiresAt: Date;
}

const columns = {
	clientId: oauthConsent.clientId,
	name: oauthClient.name,
	uri: oauthClient.uri,
	approvedAt: oauthConsent.createdAt,
};

function toApp(row: {
	clientId: string;
	name: string | null;
	uri: string | null;
	approvedAt: Date;
}): AiApp {
	return {
		...row,
		name: row.name ?? "An AI app",
		expiresAt: new Date(row.approvedAt.getTime() + aiAppLifetimeMs),
	};
}

export class AiAppDTO extends BaseDTO<AiApp> {
	/** The AI apps `userId` let in over MCP, latest first, the expired ones included until they next knock. */
	static forUser(userId: string): AiAppDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(oauthConsent)
			.innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
			.where(eq(oauthConsent.userId, userId))
			.orderBy(desc(oauthConsent.createdAt))
			.all()
			.map((row) => new AiAppDTO(toApp(row)));
	}

	/**
	 * Whether `userId` still lets AI app `clientId` in: approved less than 30 days ago. An older approval is revoked with
	 * its tokens, so the app has to send them through sign-in and consent again.
	 */
	static allowed(userId: string, clientId: string, now = new Date()): boolean {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(oauthConsent)
			.innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
			.where(
				and(
					eq(oauthConsent.userId, userId),
					eq(oauthConsent.clientId, clientId),
				),
			)
			.orderBy(desc(oauthConsent.createdAt))
			.get();
		if (!row) {
			return false;
		}
		if (toApp(row).expiresAt > now) {
			return true;
		}
		AiAppDTO.revoke(userId, clientId);
		return false;
	}

	/** Cuts AI app `clientId` off from `userId`'s data: drops the approval and every token it holds for them. */
	static revoke(userId: string, clientId: string): void {
		databaseConnection.get().transaction((transaction) => {
			for (const table of [oauthAccessToken, oauthRefreshToken, oauthConsent]) {
				transaction
					.delete(table)
					.where(and(eq(table.userId, userId), eq(table.clientId, clientId)))
					.run();
			}
		});
	}
}
