import { chmod, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { PluginDTO } from "#lib/dto/plugin.js";
import { getSetting, setPluginSettings, setSetting } from "#lib/dto/setting.js";
import type {
	PluginListing,
	PluginManifest,
	PluginPreview,
	PluginStatus,
	PluginSummary,
} from "#lib/plugins.js";
import {
	gitHub,
	type PluginSource,
	type RepositoryInfo,
} from "#lib/server/plugins/github.js";
import { officialRepository, plugins } from "#lib/server/plugins/registry.js";
import { parseManifest } from "#lib/server/validation/plugins.js";

const manifestFile = "localassistant-plugin.json";

const officialStatus: PluginStatus = {
	health: "official",
	stars: null,
	pushedAt: null,
	latestVersion: null,
	latestRef: null,
	checkedAt: null,
};

interface Resolved {
	source: PluginSource;
	info: RepositoryInfo;
	sha: string;
	version: string | null;
	manifest: PluginManifest;
}

/** Finds, installs, updates and removes plugins hosted on GitHub, and keeps track of how maintained each one is. */
class PluginManager {
	/**
	 * What installing from `link` would add: the plugin's manifest at its latest release (or newest commit), how
	 * maintained its repository is, and what would stop it from loading.
	 *
	 * @throws When the link isn't a GitHub repository, it has no valid plugin, or GitHub can't be reached.
	 */
	async preview(link: string): Promise<PluginPreview> {
		const resolved = await this.#resolve(gitHub.parseLink(link));
		const { source, info, sha, manifest } = resolved;
		return {
			link,
			repository: source.repository,
			path: source.path,
			ref: sha,
			url: this.#url(source, info.defaultBranch),
			manifest,
			status: this.#status(info, resolved),
			compatible: plugins.compatible(manifest),
			installed: PluginDTO.find(manifest.id) !== undefined,
			conflict: plugins.conflict(manifest, source.repository),
		};
	}

	/**
	 * Downloads the plugin at `link`, records it and loads it here, then has the worker load it too.
	 *
	 * @throws When it can't be previewed, needs a newer LocalAssistant, clashes with another plugin or fails to load.
	 */
	async install(link: string): Promise<PluginDTO> {
		return this.#install(await this.#resolve(gitHub.parseLink(link)));
	}

	/**
	 * Installs the newest version of the installed plugin `id`.
	 *
	 * @throws When it isn't installed from GitHub, or the new version can't be installed.
	 */
	async update(id: string): Promise<PluginDTO> {
		const row = PluginDTO.find(id);
		if (!row) {
			throw new Error("That integration isn't installed from GitHub.");
		}
		const resolved = await this.#resolve({
			repository: row.repository,
			path: row.path,
			ref: null,
		});
		if (resolved.manifest.id !== id) {
			throw new Error(
				`The new version calls itself ${resolved.manifest.id}, not ${id}. Remove it and install it again.`,
			);
		}
		return this.#install(resolved);
	}

	/** Removes the installed plugin `id`, its devices, its connection and its code; returns how many devices went. */
	async remove(id: string): Promise<number> {
		const row = PluginDTO.find(id);
		if (!row) {
			return 0;
		}
		await plugins.unload(id);
		const removed = DeviceDTO.removeKinds(
			row.manifest.kinds.map((kind) => kind.id),
		);
		setPluginSettings(id, null);
		setSetting(
			"disabledPlugins",
			getSetting("disabledPlugins").filter((entry) => entry !== id),
		);
		row.delete();
		await rm(dirname(plugins.codeFolder(id, "x")), {
			recursive: true,
			force: true,
		});
		JobDTO.enqueue("plugins.reload", {}, { maxAttempts: 1 });
		return removed;
	}

	/** Turns `id` on or off, here and in the worker. */
	setEnabled(id: string, enabled: boolean): void {
		const others = getSetting("disabledPlugins").filter(
			(entry) => entry !== id,
		);
		setSetting("disabledPlugins", enabled ? others : [...others, id]);
		JobDTO.enqueue("plugins.restart", { pluginId: id }, { maxAttempts: 1 });
	}

	/** Asks GitHub again how every installed plugin's repository is doing and what its newest version is; never throws. */
	async check(): Promise<number> {
		let checked = 0;
		for (const row of PluginDTO.all()) {
			try {
				const resolved = await this.#resolve({
					repository: row.repository,
					path: row.path,
					ref: null,
				});
				row.setStatus(this.#status(resolved.info, resolved));
				checked += 1;
			} catch {
				row.setStatus({
					...(row.status ?? officialStatus),
					health: row.status?.health ?? "unknown",
					checkedAt: new Date().toISOString(),
				});
			}
		}
		return checked;
	}

	/**
	 * Plugins on GitHub tagged as LocalAssistant plugins, marking the ones already installed.
	 *
	 * @throws When GitHub can't be reached or limits this server.
	 */
	async browse(): Promise<PluginListing[]> {
		const installed = new Set(
			PluginDTO.all().map((row) => row.repository.toLowerCase()),
		);
		return (await gitHub.search())
			.filter((info) => info.repository.toLowerCase() !== officialRepository)
			.map((info) => ({
				repository: info.repository,
				name: info.repository.split("/")[1] ?? info.repository,
				description: info.description,
				url: info.url,
				stars: info.stars,
				health: gitHub.health(info),
				installed: installed.has(info.repository.toLowerCase()),
			}));
	}

	/** Every plugin for the admin page: official ones, installed ones that loaded, and installed ones that didn't. */
	summaries(): PluginSummary[] {
		const rows = new Map(PluginDTO.all().map((row) => [row.id, row]));
		const counts = new Map<string, number>();
		for (const device of DeviceDTO.all()) {
			counts.set(device.kind, (counts.get(device.kind) ?? 0) + 1);
		}
		const summary = (
			manifest: PluginManifest,
			official: boolean,
			row: PluginDTO | undefined,
		): PluginSummary => {
			const status = official
				? officialStatus
				: (row?.status ?? { ...officialStatus, health: "unknown" as const });
			return {
				id: manifest.id,
				name: manifest.name,
				description: manifest.description,
				author: manifest.author ?? null,
				version: manifest.version,
				icon: manifest.icon,
				official,
				enabled: plugins.enabled(manifest.id),
				url: official
					? `https://github.com/${officialRepository}/tree/main/src/plugins/${manifest.id}`
					: this.#url(
							{
								repository: row?.repository ?? "",
								path: row?.path ?? "",
								ref: null,
							},
							"HEAD",
						),
				status,
				updateAvailable:
					!official &&
					status.latestRef !== null &&
					status.latestRef !== row?.ref,
				compatible: plugins.compatible(manifest),
				loadError: plugins.failure(manifest.id),
				kinds: manifest.kinds.map((kind) => kind.label),
				devices: manifest.kinds.reduce(
					(total, kind) => total + (counts.get(kind.id) ?? 0),
					0,
				),
			};
		};
		const loaded = plugins
			.all()
			.map((hosted) =>
				summary(hosted.manifest, hosted.official, rows.get(hosted.manifest.id)),
			);
		const broken = [...rows.values()]
			.filter((row) => !plugins.get(row.id))
			.map((row) => summary(row.manifest, false, row));
		return [...loaded, ...broken];
	}

	async #install(resolved: Resolved): Promise<PluginDTO> {
		const { source, info, sha, manifest } = resolved;
		const conflict = plugins.conflict(manifest, source.repository);
		if (conflict) {
			throw new Error(conflict);
		}
		if (!plugins.compatible(manifest)) {
			throw new Error(
				`It needs LocalAssistant ${manifest.localassistant} or newer. Update LocalAssistant first.`,
			);
		}
		const folder = plugins.codeFolder(manifest.id, sha);
		await this.#download(source, sha, manifest, folder);
		const previous = PluginDTO.find(manifest.id);
		const row = PluginDTO.save({
			id: manifest.id,
			repository: source.repository,
			path: source.path,
			ref: sha,
			manifest,
			status: this.#status(info, resolved),
		});
		await plugins.load(row);
		const failure = plugins.failure(manifest.id);
		if (failure) {
			if (previous) {
				PluginDTO.save({
					...previous.toJSON(),
					status: previous.status ?? officialStatus,
				});
				await plugins.load(previous);
			} else {
				row.delete();
				await plugins.unload(manifest.id);
			}
			await rm(folder, { recursive: true, force: true });
			throw new Error(`It didn't load: ${failure}`);
		}
		JobDTO.enqueue("plugins.reload", {}, { maxAttempts: 1 });
		return row;
	}

	async #download(
		source: PluginSource,
		sha: string,
		manifest: PluginManifest,
		folder: string,
	): Promise<void> {
		const entry = plugins.entryFor(manifest);
		for (const file of [entry, ...manifest.files]) {
			const bytes = await gitHub.download(
				source.repository,
				sha,
				join(source.path, file),
			);
			if (bytes === null) {
				throw new Error(
					`The repository has no ${file}: its author has to build it and commit it.`,
				);
			}
			const path = join(folder, file);
			await mkdir(dirname(path), { recursive: true });
			await Bun.write(path, bytes);
			if (
				file === entry &&
				manifest.runtime === "process" &&
				!manifest.interpreter
			) {
				await chmod(path, 0o755);
			}
		}
	}

	async #resolve(source: PluginSource): Promise<Resolved> {
		const info = await gitHub.repository(source.repository);
		const release = source.ref
			? null
			: await gitHub.latestRelease(source.repository);
		const ref = source.ref ?? release?.tag ?? info.defaultBranch;
		const sha = await gitHub.commit(source.repository, ref);
		const raw = await gitHub.file(
			source.repository,
			sha,
			join(source.path, manifestFile),
		);
		if (raw === null) {
			throw new Error(
				`That repository isn't a LocalAssistant integration: it has no ${manifestFile}${source.path ? ` in ${source.path}` : ""}.`,
			);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new Error(`Its ${manifestFile} isn't valid JSON.`);
		}
		return {
			source: { ...source, repository: info.repository },
			info,
			sha,
			version: release?.tag ?? null,
			manifest: parseManifest(parsed),
		};
	}

	#status(
		info: RepositoryInfo,
		resolved: Pick<Resolved, "sha" | "version" | "manifest">,
	): PluginStatus {
		return {
			health: gitHub.health(info),
			stars: info.stars,
			pushedAt: info.pushedAt,
			latestVersion: resolved.version ?? resolved.manifest.version,
			latestRef: resolved.sha,
			checkedAt: new Date().toISOString(),
		};
	}

	#url(source: PluginSource, branch: string): string {
		const base = `https://github.com/${source.repository}`;
		return source.path ? `${base}/tree/${branch}/${source.path}` : base;
	}
}

export const pluginManager = new PluginManager();
