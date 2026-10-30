import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { configuration } from "#lib/server/core/config.js";
import { databaseConnection } from "#lib/server/db/database.js";

const kept = 7;
const namePattern =
	/^localassistant-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite$/;

export interface BackupFile {
	name: string;
	size: number;
	createdAt: Date;
}

/** Copies of the database in a `backups` folder next to it: taken daily by the worker or by hand, the last seven kept. */
class Backups {
	/** The folder backups go to, made on first use. */
	folder(): string {
		const { databasePath } = configuration.get();
		const folder =
			databasePath === ":memory:"
				? join(tmpdir(), "localassistant-backups")
				: join(dirname(databasePath), "backups");
		mkdirSync(folder, { recursive: true });
		return folder;
	}

	/**
	 * Copies the database into a new backup and removes the oldest beyond seven; returns the new one.
	 *
	 * @throws When the copy can't be written, the disk full for one.
	 */
	create(now = new Date()): BackupFile {
		const name = `localassistant-${now.toISOString().slice(0, 19).replaceAll(":", "-")}.sqlite`;
		const path = join(this.folder(), name);
		rmSync(path, { force: true });
		databaseConnection.copyTo(path);
		for (const old of this.list().slice(kept)) {
			this.remove(old.name);
		}
		return { name, size: statSync(path).size, createdAt: now };
	}

	/** Every backup, newest first. */
	list(): BackupFile[] {
		const folder = this.folder();
		return readdirSync(folder)
			.filter((name) => namePattern.test(name))
			.map((name) => {
				const stats = statSync(join(folder, name));
				return { name, size: stats.size, createdAt: stats.mtime };
			})
			.toSorted((first, second) => second.name.localeCompare(first.name));
	}

	/** The path of the backup called `name`, or `null` for a name that isn't one. */
	path(name: string): string | null {
		return namePattern.test(name) &&
			this.list().some((backup) => backup.name === name)
			? join(this.folder(), name)
			: null;
	}

	/** Deletes the backup called `name`; a name that isn't one is ignored. */
	remove(name: string): void {
		const path = this.path(name);
		if (path) {
			rmSync(path, { force: true });
		}
	}
}

export const backups = new Backups();
