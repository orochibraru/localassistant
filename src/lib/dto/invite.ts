import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { secrets } from "#lib/server/core/secrets.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { invite, user } from "#lib/server/db/schema.js";

export interface InviteRow {
	id: string;
	email: string;
	invitedByName: string | null;
	expiresAt: Date;
	acceptedAt: Date | null;
	createdAt: Date;
}

const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export class InviteDTO extends BaseDTO<InviteRow> {
	/** Creates an invite for `email`, replacing any pending one; the raw token is only ever returned here. */
	static create(
		email: string,
		invitedBy: string,
	): { invite: InviteDTO; token: string } {
		const token = secrets.randomToken();
		const database = databaseConnection.get();
		database
			.delete(invite)
			.where(and(eq(invite.email, email), isNull(invite.acceptedAt)))
			.run();
		const row = database
			.insert(invite)
			.values({
				email,
				invitedBy,
				tokenHash: secrets.hashToken(token),
				expiresAt: new Date(Date.now() + inviteLifetimeMs),
			})
			.returning()
			.get();
		return { invite: new InviteDTO({ ...row, invitedByName: null }), token };
	}

	/** The pending, unexpired invite `token` belongs to. */
	static findByToken(token: string): InviteDTO | undefined {
		const row = databaseConnection
			.get()
			.select({
				id: invite.id,
				email: invite.email,
				invitedByName: user.name,
				expiresAt: invite.expiresAt,
				acceptedAt: invite.acceptedAt,
				createdAt: invite.createdAt,
			})
			.from(invite)
			.leftJoin(user, eq(user.id, invite.invitedBy))
			.where(
				and(
					eq(invite.tokenHash, secrets.hashToken(token)),
					isNull(invite.acceptedAt),
					gt(invite.expiresAt, new Date()),
				),
			)
			.get();
		return row ? new InviteDTO(row) : undefined;
	}

	/** Every invite, newest first. */
	static list(): InviteDTO[] {
		return databaseConnection
			.get()
			.select({
				id: invite.id,
				email: invite.email,
				invitedByName: user.name,
				expiresAt: invite.expiresAt,
				acceptedAt: invite.acceptedAt,
				createdAt: invite.createdAt,
			})
			.from(invite)
			.leftJoin(user, eq(user.id, invite.invitedBy))
			.orderBy(desc(invite.createdAt))
			.all()
			.map((row) => new InviteDTO(row));
	}

	/** How many invites are still waiting to be accepted. */
	static pendingCount(): number {
		return databaseConnection
			.get()
			.select({ id: invite.id })
			.from(invite)
			.where(and(isNull(invite.acceptedAt), gt(invite.expiresAt, new Date())))
			.all().length;
	}

	/** Deletes the invite `id`. */
	static revoke(id: string): void {
		databaseConnection.get().delete(invite).where(eq(invite.id, id)).run();
	}

	get email(): string {
		return this.row.email;
	}

	/** Marks the invite used. */
	accept(): void {
		databaseConnection
			.get()
			.update(invite)
			.set({ acceptedAt: new Date() })
			.where(eq(invite.id, this.row.id))
			.run();
	}
}
