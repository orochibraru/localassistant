import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { databaseConnection } from "#lib/server/db/database.js";
import { account } from "#lib/server/db/schema.js";

/** Whether `userId` has signed in with one of the `providerIds` (single sign-on providers). */
export function hasLinkedProvider(
	userId: string,
	providerIds: string[],
): boolean {
	if (providerIds.length === 0) {
		return false;
	}
	return (
		databaseConnection
			.get()
			.select({ id: account.id })
			.from(account)
			.where(
				and(
					eq(account.userId, userId),
					inArray(account.providerId, providerIds),
				),
			)
			.get() !== undefined
	);
}

/** Whether `userId` can sign in with a password. */
export function hasPassword(userId: string): boolean {
	return (
		databaseConnection
			.get()
			.select({ id: account.id })
			.from(account)
			.where(
				and(
					eq(account.userId, userId),
					eq(account.providerId, "credential"),
					isNotNull(account.password),
				),
			)
			.get() !== undefined
	);
}
