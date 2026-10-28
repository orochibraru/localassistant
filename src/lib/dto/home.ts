import { asc, eq, sql } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { device, floor, home, room } from "#lib/server/db/schema.js";

export interface HomeRow {
	id: string;
	name: string;
}

const columns = { id: home.id, name: home.name };

export class HomeDTO extends BaseDTO<HomeRow> {
	/** Every home, oldest first; homes made in the same second keep their creation order. */
	static all(): HomeDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(home)
			.orderBy(asc(home.createdAt), sql`rowid`)
			.all()
			.map((row) => new HomeDTO(row));
	}

	/** The home with `id`. */
	static find(id: string): HomeDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(home)
			.where(eq(home.id, id))
			.get();
		return row ? new HomeDTO(row) : undefined;
	}

	/** The first home, made when there is none so every floor, room and device has one to belong to. */
	static first(): HomeDTO {
		return HomeDTO.all()[0] ?? HomeDTO.create("Home");
	}

	/** Adds a home. */
	static create(name: string): HomeDTO {
		const row = databaseConnection
			.get()
			.insert(home)
			.values({ name })
			.returning(columns)
			.get();
		return new HomeDTO(row);
	}

	get id(): string {
		return this.row.id;
	}

	/** Renames the home. */
	rename(name: string): void {
		databaseConnection
			.get()
			.update(home)
			.set({ name })
			.where(eq(home.id, this.row.id))
			.run();
		this.row.name = name;
	}

	/** Removes the home with its devices, rooms and floors, in one transaction: the foreign keys have no ON DELETE. */
	delete(): void {
		databaseConnection.get().transaction((transaction) => {
			transaction.delete(device).where(eq(device.homeId, this.row.id)).run();
			transaction.delete(room).where(eq(room.homeId, this.row.id)).run();
			transaction.delete(floor).where(eq(floor.homeId, this.row.id)).run();
			transaction.delete(home).where(eq(home.id, this.row.id)).run();
		});
	}
}
