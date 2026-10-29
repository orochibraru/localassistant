import { asc, eq } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import type { PluginManifest, PluginStatus } from "#lib/plugins.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { plugin } from "#lib/server/db/schema.js";

export interface PluginRow {
	id: string;
	repository: string;
	path: string;
	ref: string;
	manifest: PluginManifest;
	status: PluginStatus | null;
	installedAt: Date;
	updatedAt: Date;
}

export interface NewPlugin {
	id: string;
	repository: string;
	path: string;
	ref: string;
	manifest: PluginManifest;
	status: PluginStatus;
}

export class PluginDTO extends BaseDTO<PluginRow> {
	/** Every plugin installed from GitHub, by id. */
	static all(): PluginDTO[] {
		return databaseConnection
			.get()
			.select()
			.from(plugin)
			.orderBy(asc(plugin.id))
			.all()
			.map((row) => PluginDTO.#wrap(row));
	}

	/** The installed plugin with `id`. */
	static find(id: string): PluginDTO | undefined {
		const row = databaseConnection
			.get()
			.select()
			.from(plugin)
			.where(eq(plugin.id, id))
			.get();
		return row ? PluginDTO.#wrap(row) : undefined;
	}

	/** Records a plugin installed, or the new version of one already installed. */
	static save(values: NewPlugin): PluginDTO {
		const row = databaseConnection
			.get()
			.insert(plugin)
			.values(values)
			.onConflictDoUpdate({
				target: plugin.id,
				set: { ...values, updatedAt: new Date() },
			})
			.returning()
			.get();
		return PluginDTO.#wrap(row);
	}

	static #wrap(row: typeof plugin.$inferSelect): PluginDTO {
		return new PluginDTO({
			...row,
			manifest: row.manifest as PluginManifest,
			status: row.status as PluginStatus | null,
		});
	}

	get id(): string {
		return this.row.id;
	}

	get repository(): string {
		return this.row.repository;
	}

	get path(): string {
		return this.row.path;
	}

	get ref(): string {
		return this.row.ref;
	}

	get manifest(): PluginManifest {
		return this.row.manifest;
	}

	get status(): PluginStatus | null {
		return this.row.status;
	}

	/** Records what GitHub last said about the plugin's repository. */
	setStatus(status: PluginStatus): void {
		databaseConnection
			.get()
			.update(plugin)
			.set({ status })
			.where(eq(plugin.id, this.row.id))
			.run();
		this.row.status = status;
	}

	/** Forgets the plugin. */
	delete(): void {
		databaseConnection
			.get()
			.delete(plugin)
			.where(eq(plugin.id, this.row.id))
			.run();
	}
}
