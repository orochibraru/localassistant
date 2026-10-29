import { and, asc, eq } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import type { SceneMember } from "#lib/scenes.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { scene } from "#lib/server/db/schema.js";

export interface SceneRow {
	id: string;
	homeId: string;
	name: string;
	members: SceneMember[];
}

const columns = {
	id: scene.id,
	homeId: scene.homeId,
	name: scene.name,
	members: scene.members,
};

type SelectedRow = Omit<SceneRow, "members"> & { members: unknown };

export class SceneDTO extends BaseDTO<SceneRow> {
	/** The scenes of `homeId`, by name. */
	static inHome(homeId: string): SceneDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(scene)
			.where(eq(scene.homeId, homeId))
			.orderBy(asc(scene.name))
			.all()
			.map((row) => SceneDTO.#wrap(row));
	}

	/** The scene with `id`, in `homeId` when given. */
	static find(id: string, homeId?: string): SceneDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(scene)
			.where(
				homeId === undefined
					? eq(scene.id, id)
					: and(eq(scene.id, id), eq(scene.homeId, homeId)),
			)
			.get();
		return row ? SceneDTO.#wrap(row) : undefined;
	}

	/** Adds a scene to `homeId`. */
	static create(
		homeId: string,
		definition: Pick<SceneRow, "name" | "members">,
	): SceneDTO {
		const row = databaseConnection
			.get()
			.insert(scene)
			.values({ homeId, ...definition })
			.returning(columns)
			.get();
		return SceneDTO.#wrap(row);
	}

	static #wrap(row: SelectedRow): SceneDTO {
		return new SceneDTO({ ...row, members: row.members as SceneMember[] });
	}

	get id(): string {
		return this.row.id;
	}

	get homeId(): string {
		return this.row.homeId;
	}

	get name(): string {
		return this.row.name;
	}

	get members(): SceneMember[] {
		return this.row.members;
	}

	/** Replaces the scene's name and what it sets. */
	update(definition: Pick<SceneRow, "name" | "members">): void {
		databaseConnection
			.get()
			.update(scene)
			.set({ ...definition, updatedAt: new Date() })
			.where(eq(scene.id, this.row.id))
			.run();
		Object.assign(this.row, definition);
	}

	/** Removes the scene. */
	delete(): void {
		databaseConnection
			.get()
			.delete(scene)
			.where(eq(scene.id, this.row.id))
			.run();
	}
}
