import { and, asc, eq } from "drizzle-orm";

import type { DashboardDefinition, DashboardSection } from "#lib/dashboards.js";
import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { dashboard } from "#lib/server/db/schema.js";

export interface DashboardRow extends DashboardDefinition {
	id: string;
	userId: string;
}

const columns = {
	id: dashboard.id,
	userId: dashboard.userId,
	name: dashboard.name,
	sections: dashboard.sections,
};

type SelectedRow = Omit<DashboardRow, "sections"> & { sections: unknown };

export class DashboardDTO extends BaseDTO<DashboardRow> {
	/** The dashboards `userId` made, by name. */
	static forUser(userId: string): DashboardDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(dashboard)
			.where(eq(dashboard.userId, userId))
			.orderBy(asc(dashboard.name))
			.all()
			.map((row) => DashboardDTO.#wrap(row));
	}

	/** The dashboard with `id`, when `userId` made it. */
	static find(id: string, userId: string): DashboardDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(dashboard)
			.where(and(eq(dashboard.id, id), eq(dashboard.userId, userId)))
			.get();
		return row ? DashboardDTO.#wrap(row) : undefined;
	}

	/** Adds a dashboard for `userId`. */
	static create(userId: string, definition: DashboardDefinition): DashboardDTO {
		const row = databaseConnection
			.get()
			.insert(dashboard)
			.values({ userId, ...definition })
			.returning(columns)
			.get();
		return DashboardDTO.#wrap(row);
	}

	static #wrap(row: SelectedRow): DashboardDTO {
		return new DashboardDTO({
			...row,
			sections: row.sections as DashboardSection[],
		});
	}

	get id(): string {
		return this.row.id;
	}

	get name(): string {
		return this.row.name;
	}

	get sections(): DashboardSection[] {
		return this.row.sections;
	}

	/** Replaces the dashboard's name and sections. */
	update(definition: DashboardDefinition): void {
		databaseConnection
			.get()
			.update(dashboard)
			.set({ ...definition, updatedAt: new Date() })
			.where(eq(dashboard.id, this.row.id))
			.run();
		Object.assign(this.row, definition);
	}

	/** Removes the dashboard. */
	delete(): void {
		databaseConnection
			.get()
			.delete(dashboard)
			.where(eq(dashboard.id, this.row.id))
			.run();
	}
}
