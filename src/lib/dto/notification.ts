import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";

import { databaseConnection } from "#lib/server/db/database.js";
import { notification, user } from "#lib/server/db/schema.js";

export interface NotificationAction {
	action: string;
	title: string;
}

export interface NotificationLine {
	id: number;
	title: string;
	body: string;
	url: string;
	actions: NotificationAction[];
	createdAt: Date;
	readAt: Date | null;
}

const columns = {
	id: notification.id,
	title: notification.title,
	body: notification.body,
	url: notification.url,
	actions: notification.actions,
	createdAt: notification.createdAt,
	readAt: notification.readAt,
};

/** Everyone's notification inbox, newest first; there's no row object, only finders. */
export class NotificationDTO {
	/** Puts the same notification in the inbox of each of `userIds`, skipping accounts that are gone. */
	static record(
		userIds: string[],
		entry: {
			title: string;
			body: string;
			url: string;
			actions?: NotificationAction[];
		},
		at = new Date(),
	): void {
		const existing =
			userIds.length === 0
				? []
				: databaseConnection
						.get()
						.select({ id: user.id })
						.from(user)
						.where(inArray(user.id, userIds))
						.all()
						.map((row) => row.id);
		if (existing.length === 0) {
			return;
		}
		databaseConnection
			.get()
			.insert(notification)
			.values(
				existing.map((userId) => ({
					userId,
					title: entry.title,
					body: entry.body,
					url: entry.url,
					actions:
						entry.actions && entry.actions.length > 0 ? entry.actions : null,
					createdAt: at,
				})),
			)
			.run();
	}

	/** The latest `limit` notifications of `userId`. */
	static forUser(userId: string, limit = 100): NotificationLine[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(notification)
			.where(eq(notification.userId, userId))
			.orderBy(desc(notification.id))
			.limit(limit)
			.all()
			.map((row) => ({
				...row,
				actions: (row.actions as NotificationAction[] | null) ?? [],
			}));
	}

	/** How many notifications `userId` hasn't read. */
	static unreadCount(userId: string): number {
		return (
			databaseConnection
				.get()
				.select({ total: count() })
				.from(notification)
				.where(
					and(eq(notification.userId, userId), isNull(notification.readAt)),
				)
				.get()?.total ?? 0
		);
	}

	/** Marks `ids` of `userId` read, or every one of theirs when `ids` is left out. */
	static markRead(userId: string, ids?: number[], at = new Date()): void {
		databaseConnection
			.get()
			.update(notification)
			.set({ readAt: at })
			.where(
				and(
					eq(notification.userId, userId),
					isNull(notification.readAt),
					ids === undefined ? undefined : inArray(notification.id, ids),
				),
			)
			.run();
	}

	/** Removes `ids` of `userId`, or every one of theirs when `ids` is left out; returns how many went. */
	static remove(userId: string, ids?: number[]): number {
		return databaseConnection
			.get()
			.delete(notification)
			.where(
				and(
					eq(notification.userId, userId),
					ids === undefined ? undefined : inArray(notification.id, ids),
				),
			)
			.returning({ id: notification.id })
			.all().length;
	}

	/** Removes everyone's notifications older than `before`; returns how many went. */
	static pruneBefore(before: Date): number {
		return databaseConnection
			.get()
			.delete(notification)
			.where(lt(notification.createdAt, before))
			.returning({ id: notification.id })
			.all().length;
	}
}
