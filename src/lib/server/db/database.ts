import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { type MigrationMeta, readMigrationFiles } from "drizzle-orm/migrator";

import { configuration } from "#lib/server/core/config.js";
import * as schema from "#lib/server/db/schema.js";

export type AppDatabase = BunSQLiteDatabase<typeof schema>;

export class MigrationHistoryError extends Error {}

const globalForDb = globalThis as unknown as {
	__localassistantSqlite?: Database;
	__localassistantDb?: AppDatabase;
};

/** The process's one SQLite connection, opened on first use and kept on `globalThis` across Vite HMR reloads. */
class DatabaseConnection {
	/** The shared Drizzle instance, opening the SQLite file on first use. */
	get(): AppDatabase {
		globalForDb.__localassistantDb ??= drizzle({
			client: this.#sqlite(),
			schema,
		});
		return globalForDb.__localassistantDb;
	}

	/**
	 * Checks every migration recorded in the database still exists, unchanged, in `migrations`: drizzle only compares
	 * timestamps, so an edited or replaced migration would otherwise be re-run against tables that already exist.
	 *
	 * @throws MigrationHistoryError naming the database and how to recover.
	 */
	assertMigrationHistory(
		sqlite: Database,
		migrations: MigrationMeta[],
		databasePath: string,
	): void {
		const recorded = sqlite
			.query(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
			)
			.get();
		if (!recorded) {
			return;
		}
		const known = new Map(
			migrations.map((migration) => [migration.folderMillis, migration.hash]),
		);
		const applied = sqlite
			.query<{ hash: string; created_at: number }, []>(
				"SELECT hash, created_at FROM __drizzle_migrations",
			)
			.all();
		for (const row of applied) {
			if (known.get(Number(row.created_at)) !== row.hash) {
				throw new MigrationHistoryError(
					`The database at ${databasePath} was migrated with a migration that drizzle/ no longer has unchanged ` +
						`(generated ${new Date(Number(row.created_at)).toISOString()}). A committed migration was edited or removed: ` +
						"restore it from git and add schema changes as a new migration. A local development database can instead be deleted.",
				);
			}
		}
	}

	/**
	 * Applies every pending migration from `drizzle/` in the working directory, after checking the database's history.
	 *
	 * @throws MigrationHistoryError when the history and `drizzle/` disagree.
	 */
	migrate(): void {
		const migrationsFolder = join(process.cwd(), "drizzle");
		const database = this.get();
		this.assertMigrationHistory(
			this.#sqlite(),
			readMigrationFiles({ migrationsFolder }),
			configuration.get().databasePath,
		);
		migrate(database, { migrationsFolder });
	}

	/** Closes the SQLite handle; the next `get()` reopens it. */
	close(): void {
		globalForDb.__localassistantSqlite?.close();
		globalForDb.__localassistantSqlite = undefined;
		globalForDb.__localassistantDb = undefined;
	}

	/** The raw SQLite handle, opened with WAL and foreign keys on first use. */
	#sqlite(): Database {
		if (globalForDb.__localassistantSqlite) {
			return globalForDb.__localassistantSqlite;
		}
		const { databasePath } = configuration.get();
		if (databasePath !== ":memory:") {
			mkdirSync(dirname(databasePath), { recursive: true });
		}
		const sqlite = new Database(databasePath, { create: true, strict: true });
		sqlite.exec("PRAGMA journal_mode = WAL");
		sqlite.exec("PRAGMA synchronous = NORMAL");
		sqlite.exec("PRAGMA foreign_keys = ON");
		sqlite.exec("PRAGMA busy_timeout = 5000");
		globalForDb.__localassistantSqlite = sqlite;
		return sqlite;
	}
}

export const databaseConnection = new DatabaseConnection();
