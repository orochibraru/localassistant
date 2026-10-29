import { eq } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { presence } from "#lib/server/db/schema.js";

export interface PresenceRow {
	userId: string;
	home: boolean | null;
	changedAt: Date;
}

export class PresenceDTO extends BaseDTO<PresenceRow> {
	/** Where every person was last known to be. */
	static all(): PresenceDTO[] {
		return databaseConnection
			.get()
			.select()
			.from(presence)
			.all()
			.map((row) => new PresenceDTO(row));
	}

	/** Where `userId` was last known to be, or `undefined` before anything counted for them. */
	static find(userId: string): PresenceDTO | undefined {
		const row = databaseConnection
			.get()
			.select()
			.from(presence)
			.where(eq(presence.userId, userId))
			.get();
		return row ? new PresenceDTO(row) : undefined;
	}

	/** Records that `userId` is home, away or not known, from now. */
	static record(userId: string, home: boolean | null): PresenceDTO {
		const row = { userId, home, changedAt: new Date() };
		databaseConnection
			.get()
			.insert(presence)
			.values(row)
			.onConflictDoUpdate({
				target: presence.userId,
				set: { home, changedAt: row.changedAt },
			})
			.run();
		return new PresenceDTO(row);
	}

	get userId(): string {
		return this.row.userId;
	}

	get home(): boolean | null {
		return this.row.home;
	}
}
