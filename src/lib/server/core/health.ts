import { existsSync, statfsSync, statSync } from "node:fs";
import { dirname } from "node:path";

import { configuration } from "#lib/server/core/config.js";
import { type UpdateNotice, updates } from "#lib/server/core/updates.js";
import { pluginManager } from "#lib/server/plugins/manager.js";

export interface HealthReport {
	version: string;
	uptimeSeconds: number;
	databaseBytes: number | null;
	diskFreeBytes: number | null;
	brokenPlugins: { name: string; error: string }[];
	update: UpdateNotice | null;
}

/** What an admin checks first when something's off: version, uptime, room on disk, broken integrations. */
class SystemHealth {
	/** The server's health right now. */
	report(): HealthReport {
		const { appVersion, databasePath } = configuration.get();
		const onDisk = databasePath !== ":memory:";
		return {
			version: appVersion,
			uptimeSeconds: Math.round(process.uptime()),
			databaseBytes: onDisk
				? [databasePath, `${databasePath}-wal`]
						.filter((path) => existsSync(path))
						.reduce((total, path) => total + statSync(path).size, 0)
				: null,
			diskFreeBytes: onDisk ? this.#free(dirname(databasePath)) : null,
			brokenPlugins: pluginManager
				.summaries()
				.flatMap((plugin) =>
					plugin.loadError
						? [{ name: plugin.name, error: plugin.loadError }]
						: [],
				),
			update: updates.available(),
		};
	}

	#free(folder: string): number | null {
		try {
			const stats = statfsSync(folder);
			return stats.bavail * stats.bsize;
		} catch {
			return null;
		}
	}
}

export const systemHealth = new SystemHealth();
