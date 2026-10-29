import { and, asc, eq, isNull } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import type { RoomPlan } from "#lib/house.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { room } from "#lib/server/db/schema.js";

export interface RoomRow {
	id: string;
	homeId: string | null;
	name: string;
	icon: string;
	floorId: string | null;
	outdoor: boolean;
	plan: RoomPlan[] | null;
}

export type RoomSettings = Pick<
	RoomRow,
	"name" | "icon" | "floorId" | "outdoor"
>;

const columns = {
	id: room.id,
	homeId: room.homeId,
	name: room.name,
	icon: room.icon,
	floorId: room.floorId,
	outdoor: room.outdoor,
	plan: room.plan,
};

export class RoomDTO extends BaseDTO<RoomRow> {
	/** The rooms of `homeId`, by name. */
	static inHome(homeId: string): RoomDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(room)
			.where(eq(room.homeId, homeId))
			.orderBy(asc(room.name))
			.all()
			.map((row) => new RoomDTO(row));
	}

	/** The room with `id` in `homeId`. */
	static find(id: string, homeId: string): RoomDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(room)
			.where(and(eq(room.id, id), eq(room.homeId, homeId)))
			.get();
		return row ? new RoomDTO(row) : undefined;
	}

	/** Whether another room of `homeId` than `exceptId` is called `name` in the same place: the same floor, or outside. */
	static nameTaken(
		name: string,
		homeId: string,
		place: Pick<RoomRow, "floorId" | "outdoor">,
		exceptId?: string,
	): boolean {
		return databaseConnection
			.get()
			.select({ id: room.id })
			.from(room)
			.where(
				and(
					eq(room.name, name),
					eq(room.homeId, homeId),
					eq(room.outdoor, place.outdoor),
					place.floorId === null
						? isNull(room.floorId)
						: eq(room.floorId, place.floorId),
				),
			)
			.all()
			.some((row) => row.id !== exceptId);
	}

	/** Adds a room to `homeId`. */
	static create(homeId: string, settings: RoomSettings): RoomDTO {
		const row = databaseConnection
			.get()
			.insert(room)
			.values({ ...settings, homeId })
			.returning(columns)
			.get();
		return new RoomDTO(row);
	}

	/** Changes the room's name, icon and place in the house. */
	update(settings: RoomSettings): void {
		databaseConnection
			.get()
			.update(room)
			.set(settings)
			.where(eq(room.id, this.row.id))
			.run();
		Object.assign(this.row, settings);
	}

	/** Draws the room on its floor's plan as the union of `plan`'s parts, in plan cells, or takes it off the plan with null. */
	place(plan: RoomPlan[] | null): void {
		databaseConnection
			.get()
			.update(room)
			.set({ plan })
			.where(eq(room.id, this.row.id))
			.run();
		this.row.plan = plan;
	}

	/** Removes the room; its devices move to the whole house. */
	delete(): void {
		databaseConnection.get().delete(room).where(eq(room.id, this.row.id)).run();
	}
}
