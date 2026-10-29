import { eq } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { cardLayout } from "#lib/server/db/schema.js";

export interface CardLayout {
	order: string[];
	brief: string[];
}

export class CardLayoutDTO extends BaseDTO<CardLayout> {
	/** The order `userId` arranged the cards in and the cards they keep brief; both empty until they change them. */
	static forUser(userId: string): CardLayout {
		const row = databaseConnection
			.get()
			.select({ order: cardLayout.order, brief: cardLayout.brief })
			.from(cardLayout)
			.where(eq(cardLayout.userId, userId))
			.get();
		return row ?? { order: [], brief: [] };
	}

	/** Stores the order `userId` arranged the cards in. */
	static arrange(userId: string, order: string[]): void {
		CardLayoutDTO.#save(userId, { ...CardLayoutDTO.forUser(userId), order });
	}

	/** Shows or hides the details on `deviceId`'s card for `userId`. */
	static showDetails(userId: string, deviceId: string, shown: boolean): void {
		const layout = CardLayoutDTO.forUser(userId);
		const brief = layout.brief.filter((id) => id !== deviceId);
		CardLayoutDTO.#save(userId, {
			...layout,
			brief: shown ? brief : [...brief, deviceId],
		});
	}

	static #save(userId: string, layout: CardLayout): void {
		databaseConnection
			.get()
			.insert(cardLayout)
			.values({ userId, ...layout })
			.onConflictDoUpdate({ target: cardLayout.userId, set: layout })
			.run();
	}
}
