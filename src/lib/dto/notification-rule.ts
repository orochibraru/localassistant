import { and, asc, eq } from "drizzle-orm";

import type { StateTest } from "#lib/automations.js";
import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { notificationRule } from "#lib/server/db/schema.js";

export interface NotificationRuleRow {
	id: string;
	userId: string;
	test: StateTest;
}

const columns = {
	id: notificationRule.id,
	userId: notificationRule.userId,
	test: notificationRule.test,
};

type SelectedRow = Omit<NotificationRuleRow, "test"> & { test: unknown };

export class NotificationRuleDTO extends BaseDTO<NotificationRuleRow> {
	/** Every rule of every account, for the worker. */
	static all(): NotificationRuleDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(notificationRule)
			.all()
			.map((row) => NotificationRuleDTO.#wrap(row));
	}

	/** The rules `userId` set, oldest first. */
	static forUser(userId: string): NotificationRuleDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(notificationRule)
			.where(eq(notificationRule.userId, userId))
			.orderBy(asc(notificationRule.createdAt))
			.all()
			.map((row) => NotificationRuleDTO.#wrap(row));
	}

	/** Adds a rule telling `userId` when `test` fires. */
	static create(userId: string, test: StateTest): NotificationRuleDTO {
		const row = databaseConnection
			.get()
			.insert(notificationRule)
			.values({ userId, test })
			.returning(columns)
			.get();
		return NotificationRuleDTO.#wrap(row);
	}

	/** Removes the rule `id` of `userId`, if it's theirs. */
	static remove(id: string, userId: string): void {
		databaseConnection
			.get()
			.delete(notificationRule)
			.where(
				and(eq(notificationRule.id, id), eq(notificationRule.userId, userId)),
			)
			.run();
	}

	static #wrap(row: SelectedRow): NotificationRuleDTO {
		return new NotificationRuleDTO({ ...row, test: row.test as StateTest });
	}

	get userId(): string {
		return this.row.userId;
	}

	get test(): StateTest {
		return this.row.test;
	}
}
