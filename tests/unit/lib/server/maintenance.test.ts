import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";

import { getSetting, setSetting } from "#lib/dto/setting.js";
import { formatBytes, formatDuration } from "#lib/format.js";
import { backups } from "#lib/server/core/backups.js";
import { configuration } from "#lib/server/core/config.js";
import { systemHealth } from "#lib/server/core/health.js";
import { isNewer, updates } from "#lib/server/core/updates.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";

import { resetDatabase } from "../../database.js";

function clearBackups() {
	rmSync(backups.folder(), { recursive: true, force: true });
}

describe("backups", () => {
	beforeEach(() => {
		resetDatabase();
		clearBackups();
	});

	test("copy the whole database, keep the last seven and refuse odd names", () => {
		setSetting("multipleHomes", true);
		const first = backups.create(new Date("2026-01-01T10:00:00Z"));
		expect(first.name).toBe("localassistant-2026-01-01T10-00-00.sqlite");
		expect(first.size).toBeGreaterThan(0);
		const path = backups.path(first.name);
		expect(path).not.toBeNull();
		const copy = new Database(path ?? "", { readonly: true });
		expect(
			copy.query("SELECT value FROM setting WHERE key = 'multipleHomes'").get(),
		).toEqual({ value: "true" });
		copy.close();
		for (let day = 2; day <= 9; day += 1) {
			backups.create(new Date(`2026-01-0${Math.min(day, 9)}T10:00:00Z`));
		}
		const kept = backups.list();
		expect(kept).toHaveLength(7);
		expect(kept[0]?.name).toBe("localassistant-2026-01-09T10-00-00.sqlite");
		expect(backups.path(first.name)).toBeNull();
		expect(backups.path("../secrets.sqlite")).toBeNull();
		backups.remove("../secrets.sqlite");
		backups.remove(kept[0]?.name ?? "");
		expect(backups.list()).toHaveLength(6);
	});

	test("the worker takes one a day", () => {
		jobHandlers["backup.run"]({});
		expect(backups.list()).toHaveLength(1);
	});
});

describe("updates", () => {
	beforeEach(resetDatabase);

	test("compare versions by their numbers", () => {
		expect(isNewer("v1.10.0", "1.9.3")).toBe(true);
		expect(isNewer("1.2.0", "1.2")).toBe(false);
		expect(isNewer("1.2.1", "v1.2")).toBe(true);
		expect(isNewer("0.9.0", "1.0.0")).toBe(false);
		expect(isNewer("nightly", "1.0.0")).toBe(false);
	});

	test("record the latest release and say when it's newer than this one", async () => {
		const answer = (body: unknown, status = 200) =>
			(() =>
				Promise.resolve(
					new Response(JSON.stringify(body), { status }),
				)) as unknown as typeof fetch;
		expect(await updates.check(answer({}, 403))).toBeNull();
		expect(await updates.check(answer({ tag_name: 3 }))).toBeNull();
		expect(
			await updates.check((() =>
				Promise.reject(new Error("offline"))) as unknown as typeof fetch),
		).toBeNull();
		expect(updates.available()).toBeNull();
		const running = configuration.get().appVersion;
		expect(
			await updates.check(
				answer({ tag_name: running, html_url: "https://example.com/r" }),
			),
		).toEqual({ version: running, url: "https://example.com/r" });
		expect(updates.available()).toBeNull();
		await updates.check(
			answer({ tag_name: "v999.0.0", html_url: "https://example.com/new" }),
		);
		expect(updates.available()).toEqual({
			version: "v999.0.0",
			url: "https://example.com/new",
		});
		expect(getSetting("latestRelease")?.checkedAt).toBeString();
	});
});

describe("system health", () => {
	beforeEach(() => {
		resetDatabase();
		clearBackups();
	});

	test("reports the version, uptime, backups and integrations", () => {
		const report = systemHealth.report();
		expect(report.version).toBe(configuration.get().appVersion);
		expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
		expect(report.lastBackupAt).toBeNull();
		expect(report.brokenPlugins).toEqual([]);
		const backup = backups.create();
		expect(systemHealth.report().lastBackupAt).toBeInstanceOf(Date);
		const running = configuration.get();
		try {
			configuration.set({
				...running,
				databasePath: backups.path(backup.name) ?? "",
			});
			const onDisk = systemHealth.report();
			expect(onDisk.databaseBytes).toBe(backup.size);
			expect(onDisk.diskFreeBytes).toBeGreaterThan(0);
		} finally {
			configuration.set(running);
		}
	});

	test("sizes and durations read the way people say them", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(1536)).toBe("1.5 KB");
		expect(formatBytes(5 * 1024 ** 3)).toBe("5 GB");
		expect(formatDuration(30)).toBe("less than a minute");
		expect(formatDuration(60)).toBe("1 minute");
		expect(formatDuration(7200)).toBe("2 hours");
		expect(formatDuration(3 * 86_400)).toBe("3 days");
	});
});
