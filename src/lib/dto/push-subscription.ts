import { and, eq, inArray } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { pushSubscription } from "#lib/server/db/schema.js";

export interface PushSubscriptionRow {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	device: string;
	createdAt: Date;
}

const columns = {
	id: pushSubscription.id,
	endpoint: pushSubscription.endpoint,
	p256dh: pushSubscription.p256dh,
	auth: pushSubscription.auth,
	device: pushSubscription.device,
	createdAt: pushSubscription.createdAt,
};

export class PushSubscriptionDTO extends BaseDTO<PushSubscriptionRow> {
	/** Saves a device's subscription for `userId`, taking it over if another account had that browser. */
	static save(
		userId: string,
		subscription: Pick<
			PushSubscriptionRow,
			"endpoint" | "p256dh" | "auth" | "device"
		>,
	): void {
		databaseConnection
			.get()
			.insert(pushSubscription)
			.values({ userId, ...subscription })
			.onConflictDoUpdate({
				target: pushSubscription.endpoint,
				set: { userId, ...subscription },
			})
			.run();
	}

	/** The devices `userId` turned notifications on for, newest first. */
	static forUser(userId: string): PushSubscriptionDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, userId))
			.all()
			.toSorted(
				(left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
			)
			.map((row) => new PushSubscriptionDTO(row));
	}

	/** Every device of every account in `userIds`. */
	static forUsers(userIds: string[]): PushSubscriptionDTO[] {
		if (userIds.length === 0) {
			return [];
		}
		return databaseConnection
			.get()
			.select(columns)
			.from(pushSubscription)
			.where(inArray(pushSubscription.userId, userIds))
			.all()
			.map((row) => new PushSubscriptionDTO(row));
	}

	/** Forgets `endpoint`, but only when it belongs to `userId`. */
	static removeFor(userId: string, endpoint: string): void {
		databaseConnection
			.get()
			.delete(pushSubscription)
			.where(
				and(
					eq(pushSubscription.userId, userId),
					eq(pushSubscription.endpoint, endpoint),
				),
			)
			.run();
	}

	/** Forgets `endpoint`, which the push service said is gone. */
	static removeEndpoint(endpoint: string): void {
		databaseConnection
			.get()
			.delete(pushSubscription)
			.where(eq(pushSubscription.endpoint, endpoint))
			.run();
	}

	get endpoint(): string {
		return this.row.endpoint;
	}

	/** The subscription in the shape the Web Push protocol takes. */
	toWebPush(): { endpoint: string; keys: { p256dh: string; auth: string } } {
		return {
			endpoint: this.row.endpoint,
			keys: { p256dh: this.row.p256dh, auth: this.row.auth },
		};
	}
}
