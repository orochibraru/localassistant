import { eq } from "drizzle-orm";

import type { CardSize } from "#lib/devices.js";
import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { cardSize } from "#lib/server/db/schema.js";

export interface CardSizeRow {
	deviceId: string;
	size: CardSize;
}

export class CardSizeDTO extends BaseDTO<CardSizeRow> {
	/** The card sizes `userId` picked, by device id; devices left out keep their default size. */
	static forUser(userId: string): Record<string, CardSize> {
		return Object.fromEntries(
			databaseConnection
				.get()
				.select({ deviceId: cardSize.deviceId, size: cardSize.size })
				.from(cardSize)
				.where(eq(cardSize.userId, userId))
				.all()
				.map((row) => [row.deviceId, row.size]),
		);
	}

	/** Stores the size `userId` picked for `deviceId`'s card. */
	static save(userId: string, deviceId: string, size: CardSize): void {
		databaseConnection
			.get()
			.insert(cardSize)
			.values({ userId, deviceId, size })
			.onConflictDoUpdate({
				target: [cardSize.userId, cardSize.deviceId],
				set: { size },
			})
			.run();
	}
}
