import { and, count, desc, eq, gt } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import {
	passkey,
	session,
	twoFactor,
	user,
	type userRoles,
	verification,
} from "#lib/server/db/schema.js";

export type UserRole = (typeof userRoles)[number];

export interface UserRow {
	id: string;
	name: string;
	email: string;
	role: UserRole;
	twoFactorEnabled: boolean;
	passkeyCount: number;
	createdAt: Date;
}

export class UserDTO extends BaseDTO<UserRow> {
	/** Every account, newest first, with its security factors. */
	static list(): UserDTO[] {
		const database = databaseConnection.get();
		const passkeyCounts = database
			.select({
				userId: passkey.userId,
				passkeyCount: count().as("passkey_count"),
			})
			.from(passkey)
			.groupBy(passkey.userId)
			.as("passkey_counts");
		return database
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				twoFactorEnabled: user.twoFactorEnabled,
				passkeyCount: passkeyCounts.passkeyCount,
				createdAt: user.createdAt,
			})
			.from(user)
			.leftJoin(passkeyCounts, eq(passkeyCounts.userId, user.id))
			.orderBy(desc(user.createdAt))
			.all()
			.map(
				(row) =>
					new UserDTO({
						...row,
						twoFactorEnabled: row.twoFactorEnabled ?? false,
						passkeyCount: row.passkeyCount ?? 0,
					}),
			);
	}

	/** How many accounts exist. */
	static count(): number {
		return (
			databaseConnection.get().select({ total: count() }).from(user).get()
				?.total ?? 0
		);
	}

	/** The id of the account using `email`, if any. */
	static idForEmail(email: string): string | undefined {
		return databaseConnection
			.get()
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, email))
			.get()?.id;
	}

	/** Whether account `userId` turned on an authenticator app. */
	static twoFactorEnabled(userId: string): boolean {
		return (
			databaseConnection
				.get()
				.select({ enabled: user.twoFactorEnabled })
				.from(user)
				.where(eq(user.id, userId))
				.get()?.enabled === true
		);
	}

	/** Whether an account uses `email`. */
	static emailExists(email: string): boolean {
		return (
			databaseConnection
				.get()
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, email))
				.get() !== undefined
		);
	}

	/** The ids of every account holding the admin role. */
	static adminIds(): string[] {
		return databaseConnection
			.get()
			.select({ id: user.id })
			.from(user)
			.where(eq(user.role, "admin"))
			.all()
			.map((row) => row.id);
	}

	/** How many accounts hold the admin role. */
	static adminCount(): number {
		return (
			databaseConnection
				.get()
				.select({ total: count() })
				.from(user)
				.where(eq(user.role, "admin"))
				.get()?.total ?? 0
		);
	}

	/** The address of the account a live password reset `token` was sent for. */
	static emailForPasswordReset(token: string): string | undefined {
		return databaseConnection
			.get()
			.select({ email: user.email })
			.from(verification)
			.innerJoin(user, eq(user.id, verification.value))
			.where(
				and(
					eq(verification.identifier, `reset-password:${token}`),
					gt(verification.expiresAt, new Date()),
				),
			)
			.get()?.email;
	}

	/** Moves `userId` to `email`, which counts as verified: a code proved it, or an admin set it. */
	static changeEmail(userId: string, email: string): void {
		databaseConnection
			.get()
			.update(user)
			.set({ email, emailVerified: true })
			.where(eq(user.id, userId))
			.run();
	}

	/** Removes `userId`'s authenticator app and passkeys and signs them out everywhere, for a locked-out account. */
	static resetFactors(userId: string): void {
		databaseConnection.get().transaction((transaction) => {
			transaction.delete(twoFactor).where(eq(twoFactor.userId, userId)).run();
			transaction.delete(passkey).where(eq(passkey.userId, userId)).run();
			transaction
				.update(user)
				.set({ twoFactorEnabled: false })
				.where(eq(user.id, userId))
				.run();
			transaction.delete(session).where(eq(session.userId, userId)).run();
		});
	}

	/** Gives `userId` the `role`. */
	static setRole(userId: string, role: UserRole): void {
		databaseConnection
			.get()
			.update(user)
			.set({ role })
			.where(eq(user.id, userId))
			.run();
	}

	/** Records that `userId` proved ownership of their address. */
	static markEmailVerified(userId: string): void {
		databaseConnection
			.get()
			.update(user)
			.set({ emailVerified: true })
			.where(eq(user.id, userId))
			.run();
	}

	/** Signs `userId` out everywhere. */
	static revokeSessions(userId: string): void {
		databaseConnection
			.get()
			.delete(session)
			.where(eq(session.userId, userId))
			.run();
	}

	/** Deletes `userId` and, through the foreign keys, their sessions, factors and memberships' links. */
	static delete(userId: string): void {
		databaseConnection.get().delete(user).where(eq(user.id, userId)).run();
	}
}
