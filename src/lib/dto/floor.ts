import { and, asc, eq, isNull } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { floor, room } from "#lib/server/db/schema.js";

export interface FloorRow {
	id: string;
	homeId: string | null;
	name: string;
	level: number;
}

const columns = {
	id: floor.id,
	homeId: floor.homeId,
	name: floor.name,
	level: floor.level,
};

export class FloorDTO extends BaseDTO<FloorRow> {
	/** The floors of `homeId`, lowest first. */
	static inHome(homeId: string): FloorDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(floor)
			.where(eq(floor.homeId, homeId))
			.orderBy(asc(floor.level), asc(floor.name))
			.all()
			.map((row) => new FloorDTO(row));
	}

	/** The floor with `id` in `homeId`. */
	static find(id: string, homeId: string): FloorDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(floor)
			.where(and(eq(floor.id, id), eq(floor.homeId, homeId)))
			.get();
		return row ? new FloorDTO(row) : undefined;
	}

	/** Whether another floor of `homeId` than `exceptId` is called `name`. */
	static nameTaken(name: string, homeId: string, exceptId?: string): boolean {
		return databaseConnection
			.get()
			.select({ id: floor.id })
			.from(floor)
			.where(and(eq(floor.name, name), eq(floor.homeId, homeId)))
			.all()
			.some((row) => row.id !== exceptId);
	}

	/** Adds a floor at `level` (0 the ground floor, negative below it); the home's indoor rooms on no floor move onto it. */
	static create(homeId: string, name: string, level: number): FloorDTO {
		return databaseConnection.get().transaction((transaction) => {
			const row = transaction
				.insert(floor)
				.values({ homeId, name, level })
				.returning(columns)
				.get();
			transaction
				.update(room)
				.set({ floorId: row.id })
				.where(
					and(
						eq(room.homeId, homeId),
						isNull(room.floorId),
						eq(room.outdoor, false),
					),
				)
				.run();
			return new FloorDTO(row);
		});
	}

	/** The floor of `homeId` indoor rooms land on by default: the one nearest the ground, the lower one on a tie. */
	static nearestGround(homeId: string): FloorDTO | undefined {
		return FloorDTO.nearest(homeId, 0);
	}

	/** The floor of `homeId` nearest `level` other than `exceptId`, the lower one on a tie. */
	static nearest(
		homeId: string,
		level: number,
		exceptId?: string,
	): FloorDTO | undefined {
		return FloorDTO.inHome(homeId)
			.filter((entry) => entry.row.id !== exceptId)
			.toSorted(
				(first, second) =>
					Math.abs(first.row.level - level) -
						Math.abs(second.row.level - level) ||
					first.row.level - second.row.level,
			)[0];
	}

	/** Renames the floor and sets its level. */
	update(name: string, level: number): void {
		databaseConnection
			.get()
			.update(floor)
			.set({ name, level })
			.where(eq(floor.id, this.row.id))
			.run();
		Object.assign(this.row, { name, level });
	}

	/**
	 * Removes the floor; its rooms move to the nearest remaining floor, or lose their floor when it was the last. Done here
	 * because the column's foreign key has no ON DELETE in SQLite.
	 */
	delete(): void {
		const next = this.row.homeId
			? FloorDTO.nearest(this.row.homeId, this.row.level, this.row.id)
			: undefined;
		databaseConnection.get().transaction((transaction) => {
			transaction
				.update(room)
				.set({ floorId: next?.row.id ?? null })
				.where(eq(room.floorId, this.row.id))
				.run();
			transaction.delete(floor).where(eq(floor.id, this.row.id)).run();
		});
	}
}
