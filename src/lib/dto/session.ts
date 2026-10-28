import { and, eq, gt, ne } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { session } from "#lib/server/db/schema.js";

export interface SessionRow {
	id: string;
	createdAt: Date;
	lastActiveAt: Date;
	userAgent: string | null;
}

export class SessionDTO extends BaseDTO<SessionRow> {
	/** `userId`'s live sessions, the most recently used first, without their tokens. */
	static forUser(userId: string): SessionDTO[] {
		return databaseConnection
			.get()
			.select({
				id: session.id,
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
				userAgent: session.userAgent,
			})
			.from(session)
			.where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
			.all()
			.map(
				(row) =>
					new SessionDTO({
						id: row.id,
						createdAt: row.createdAt,
						lastActiveAt: row.updatedAt,
						userAgent: row.userAgent,
					}),
			)
			.toSorted(
				(first, second) =>
					second.row.lastActiveAt.getTime() - first.row.lastActiveAt.getTime(),
			);
	}

	/** Signs out the session `sessionId` if it belongs to `userId`, and returns whether it did. */
	static revokeForUser(sessionId: string, userId: string): boolean {
		return (
			databaseConnection
				.get()
				.delete(session)
				.where(and(eq(session.id, sessionId), eq(session.userId, userId)))
				.returning({ id: session.id })
				.all().length > 0
		);
	}

	/** Signs out every session of `userId` except `keepId`. */
	static revokeOthers(userId: string, keepId: string): void {
		databaseConnection
			.get()
			.delete(session)
			.where(and(eq(session.userId, userId), ne(session.id, keepId)))
			.run();
	}

	/** Signs out the session `sessionId`. */
	static revoke(sessionId: string): void {
		databaseConnection
			.get()
			.delete(session)
			.where(eq(session.id, sessionId))
			.run();
	}
}
