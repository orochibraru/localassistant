import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { readMigrationFiles } from "drizzle-orm/migrator";

import {
	databaseConnection,
	MigrationHistoryError,
} from "#lib/server/db/database.js";

const migrations = readMigrationFiles({
	migrationsFolder: join(process.cwd(), "drizzle"),
});

function databaseWithHistory(
	rows: { hash: string; createdAt: number }[],
): Database {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)",
	);
	for (const row of rows) {
		sqlite
			.query(
				"INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
			)
			.run(row.hash, row.createdAt);
	}
	return sqlite;
}

describe("migration history", () => {
	test("a fresh database and a matching history pass", () => {
		expect(() =>
			databaseConnection.assertMigrationHistory(
				new Database(":memory:"),
				migrations,
				":memory:",
			),
		).not.toThrow();
		const matching = databaseWithHistory(
			migrations.map((migration) => ({
				hash: migration.hash,
				createdAt: migration.folderMillis,
			})),
		);
		expect(() =>
			databaseConnection.assertMigrationHistory(
				matching,
				migrations,
				":memory:",
			),
		).not.toThrow();
	});

	test("an edited or replaced migration stops the boot with a clear message", () => {
		const first = migrations[0];
		expect(first).toBeDefined();
		const edited = databaseWithHistory([
			{ hash: "something-else", createdAt: first?.folderMillis ?? 0 },
		]);
		expect(() =>
			databaseConnection.assertMigrationHistory(
				edited,
				migrations,
				"./data/test.sqlite",
			),
		).toThrow(MigrationHistoryError);
		const replaced = databaseWithHistory([
			{ hash: first?.hash ?? "", createdAt: 1 },
		]);
		expect(() =>
			databaseConnection.assertMigrationHistory(
				replaced,
				migrations,
				"./data/test.sqlite",
			),
		).toThrow("./data/test.sqlite");
	});
});
