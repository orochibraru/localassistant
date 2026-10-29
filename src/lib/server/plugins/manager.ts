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
import { officialRepository, plugins } from "#lib/server/plugins/registry.js";
import { pluginSources } from "#lib/server/plugins/sources/sources.js";
import type {
	Location,
	RepositoryInfo,
} from "#lib/server/plugins/sources/types.js";
import { parseManifest } from "#lib/server/validation/plugins.js";

const manifestFile = "localassistant-plugin.json";

const officialStatus: PluginStatus = {
	health: "official",
	url: null,
	stars: null,
	pushedAt: null,
	latestVersion: null,
	latestRef: null,
	checkedAt: null,
};

interface Resolved {
	location: Location;
	info: RepositoryInfo;
	sha: string;
	version: string | null;
	manifest: PluginManifest;
}

/**
 * Finds, installs, updates and removes plugins from GitHub, GitLab, Gitea or Forgejo, or a folder on this server, and
 * keeps track of how maintained each one is.
 */
class PluginManager {
	/**
	 * What installing from `link` would add: the plugin's manifest at its latest release (or newest commit), how
	 * maintained its repository is, and what would stop it from loading.
	 *
	 * @throws When the link isn't a repository or folder, it has no valid plugin, or its site can't be reached.
	 */
	async preview(link: string): Promise<PluginPreview> {
		const resolved = await this.#resolve(await pluginSources.locate(link));
		const { location, sha, manifest } = resolved;
		const status = this.#status(resolved);
		return {
			link,
			repository: location.repository,
			path: location.path,
			ref: sha,
			site: pluginSources.site(location),
			url: status.url,
			manifest,
			status,
			compatible: plugins.compatible(manifest),
			installed: PluginDTO.find(manifest.id) !== undefined,
			conflict: plugins.conflict(manifest, pluginSources.key(location)),
		};
	}

	/**
	 * Downloads the plugin at `link`, records it and loads it here, then has the worker load it too.
	 *
	 * @throws When it can't be previewed, needs a newer LocalAssistant, clashes with another plugin or fails to load.
	 */
	async install(link: string): Promise<PluginDTO> {
		return this.#install(await this.#resolve(await pluginSources.locate(link)));
	}

	/**
	 * Installs the newest version of the installed plugin `id`.
	 *
	 * @throws When it ships with LocalAssistant, or the new version can't be installed.
	 */
	async update(id: string): Promise<PluginDTO> {
		const row = PluginDTO.find(id);
		if (!row) {
			throw new Error(
				"That integration ships with LocalAssistant: it updates with it.",
			);
		}
		const resolved = await this.#resolve(
			pluginSources.fromKey(row.repository, row.path),
		);
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

	/** Asks every installed plugin's source again how it's doing and what its newest version is; never throws. */
	async check(): Promise<number> {
		let checked = 0;
		for (const row of PluginDTO.all()) {
			try {
				const resolved = await this.#resolve(
					pluginSources.fromKey(row.repository, row.path),
				);
				row.setStatus(this.#status(resolved));
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
	 * Plugins tagged as LocalAssistant plugins on GitHub, gitlab.com and Codeberg, marking the ones already installed.
	 *
	 * @throws When none of those sites can be reached.
	 */
	async browse(): Promise<PluginListing[]> {
		const installed = new Set(
			PluginDTO.all().map((row) => row.repository.toLowerCase()),
		);
		return (await pluginSources.search())
			.map((info) => ({ info, key: pluginSources.key(info).toLowerCase() }))
			.filter(({ key }) => key !== officialRepository)
			.map(({ info, key }) => ({
				repository: info.repository,
				name: info.repository.split("/").at(-1) ?? info.repository,
				description: info.description,
				site: pluginSources.site(info),
				url: info.url ?? info.origin,
				stars: info.stars ?? 0,
				health: pluginSources.health(info, info.kind),
				installed: installed.has(key),
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
				site:
					official || !row
						? "github.com"
						: pluginSources.site(
								pluginSources.fromKey(row.repository, row.path),
							),
				url: official
					? `https://github.com/orochibraru/localassistant/tree/main/src/plugins/${manifest.id}`
					: (status.url ?? null),
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
		const { location, sha, manifest } = resolved;
		const key = pluginSources.key(location);
		const conflict = plugins.conflict(manifest, key);
		if (conflict) {
			throw new Error(conflict);
		}
		if (!plugins.compatible(manifest)) {
			throw new Error(
				`It needs LocalAssistant ${manifest.localassistant} or newer. Update LocalAssistant first.`,
			);
		}
		const folder = plugins.codeFolder(manifest.id, sha);
		await this.#download(location, sha, manifest, folder);
		const previous = PluginDTO.find(manifest.id);
		const row = PluginDTO.save({
			id: manifest.id,
			repository: key,
			path: location.path,
			ref: sha,
			manifest,
			status: this.#status(resolved),
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
		location: Location,
		sha: string,
		manifest: PluginManifest,
		folder: string,
	): Promise<void> {
		const entry = plugins.entryFor(manifest);
		const forge = pluginSources.forge(location.kind);
		const token =
			location.kind === "folder" ? null : pluginSources.token(location.origin);
		for (const file of [entry, ...manifest.files]) {
			const bytes = await forge.download(
				location,
				sha,
				join(location.path, file),
				token,
			);
			if (bytes === null) {
				throw new Error(
					location.kind === "folder"
						? `The folder has no ${file}: build it there first.`
						: `The repository has no ${file}: its author has to build it and commit it.`,
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

	async #resolve(location: Location): Promise<Resolved> {
		const forge = pluginSources.forge(location.kind);
		const token =
			location.kind === "folder" ? null : pluginSources.token(location.origin);
		const info = await forge.repository(location, token);
		const release = location.ref
			? null
			: await forge.latestRelease(location, token);
		const ref = location.ref ?? release?.tag ?? info.defaultBranch;
		const sha = await forge.commit(location, ref, token);
		const bytes = await forge.download(
			location,
			sha,
			join(location.path, manifestFile),
			token,
		);
		if (bytes === null) {
			throw new Error(
				`That isn't a LocalAssistant integration: it has no ${manifestFile}${location.path ? ` in ${location.path}` : ""}.`,
			);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(new TextDecoder().decode(bytes));
		} catch {
			throw new Error(`Its ${manifestFile} isn't valid JSON.`);
		}
		const resolvedLocation = { ...location, repository: info.repository };
		return {
			location: resolvedLocation,
			info,
			sha,
			version: release?.tag ?? null,
			manifest: parseManifest(parsed),
		};
	}

	#status(resolved: Resolved): PluginStatus {
		const { location, info } = resolved;
		return {
			health: pluginSources.health(info, location.kind),
			url: pluginSources
				.forge(location.kind)
				.webUrl(location, info.defaultBranch),
			stars: info.stars,
			pushedAt: info.pushedAt,
			latestVersion: resolved.version ?? resolved.manifest.version,
			latestRef: resolved.sha,
			checkedAt: new Date().toISOString(),
		};
	}
}

export const pluginManager = new PluginManager();
