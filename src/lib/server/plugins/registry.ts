import { dirname, join } from "node:path";

import { PluginDTO } from "#lib/dto/plugin.js";
import { getSetting } from "#lib/dto/setting.js";
import type { Plugin } from "#lib/plugin-sdk.js";
import type { KindCatalog, PluginManifest } from "#lib/plugins.js";
import { configuration } from "#lib/server/core/config.js";
import { Logger } from "#lib/server/core/logger.js";
import {
	type HostedContext,
	pluginContexts,
} from "#lib/server/plugins/context.js";
import { processPlugins } from "#lib/server/plugins/process.js";
import { parseManifest } from "#lib/server/validation/plugins.js";
import { officialPlugins } from "#plugins/official.js";

const logger = new Logger("Plugins");

export const officialRepository = "orochibraru/localassistant";

const hooks = [
	"connect",
	"discover",
	"add",
	"start",
	"stop",
	"read",
	"command",
	"serve",
	"clips",
] as const;

export interface HostedPlugin {
	manifest: PluginManifest;
	plugin: Plugin;
	official: boolean;
	ref: string | null;
	context: HostedContext;
}

/**
 * Every plugin this process runs: the official ones shipped in `src/plugins/`, and the ones an admin installed from
 * GitHub, imported from the data folder. Routes each device kind to its plugin and starts and stops the long-running
 * side of each in the worker.
 */
class Plugins {
	#hosted = new Map<string, HostedPlugin>();
	#failures = new Map<string, string>();
	#running = new Set<string>();
	#officialLoaded = false;

	/** Every plugin loaded, official first, then by name. */
	all(): HostedPlugin[] {
		this.#loadOfficial();
		return [...this.#hosted.values()].toSorted(
			(first, second) =>
				Number(second.official) - Number(first.official) ||
				first.manifest.name.localeCompare(second.manifest.name),
		);
	}

	/** The plugin with `id`, loaded or not. */
	get(id: string): HostedPlugin | undefined {
		this.#loadOfficial();
		return this.#hosted.get(id);
	}

	/** The plugin that provides devices of `kind`. */
	forKind(kind: string): HostedPlugin | undefined {
		return this.all().find((hosted) =>
			hosted.manifest.kinds.some((entry) => entry.id === kind),
		);
	}

	/** Whether an admin left `id` turned on. */
	enabled(id: string): boolean {
		return !getSetting("disabledPlugins").includes(id);
	}

	/** Why the installed plugin `id` didn't load, if it didn't. */
	failure(id: string): string | null {
		return this.#failures.get(id) ?? null;
	}

	/** Whether `manifest` asks for a LocalAssistant this one is at least. */
	compatible(manifest: PluginManifest): boolean {
		const wanted = this.#version(manifest.localassistant);
		const running = this.#version(configuration.get().appVersion);
		if (!wanted || !running) {
			return true;
		}
		for (const [index, part] of wanted.entries()) {
			const have = running[index] ?? 0;
			if (have !== part) {
				return have > part;
			}
		}
		return true;
	}

	/** What would stop `manifest` from loading next to the others: its id or one of its kinds taken. */
	conflict(manifest: PluginManifest, repository: string): string | null {
		const taken = this.get(manifest.id);
		if (
			taken &&
			(taken.official || this.#repository(taken.manifest.id) !== repository)
		) {
			return `Another integration already uses the id ${manifest.id}.`;
		}
		for (const kind of manifest.kinds) {
			const owner = this.forKind(kind.id);
			if (owner && owner.manifest.id !== manifest.id) {
				return `${owner.manifest.name} already provides ${kind.label.toLowerCase()} devices as ${kind.id}.`;
			}
		}
		return null;
	}

	/** What every device kind shows as, the phone or tablet included, for cards, pickers and sorting. */
	catalog(): KindCatalog {
		const catalog: KindCatalog = {
			app: {
				plugin: "",
				label: "Phone or tablet",
				card: "app",
				icon: "smartphone",
				size: "medium",
				order: 5,
				houseMeter: false,
			},
		};
		for (const { manifest } of this.all()) {
			for (const kind of manifest.kinds) {
				catalog[kind.id] = {
					plugin: manifest.id,
					label: kind.label,
					card: kind.card,
					icon: kind.icon,
					size: kind.size ?? "medium",
					order: kind.order ?? 9,
					houseMeter: kind.houseMeter ?? false,
				};
			}
		}
		return catalog;
	}

	/** The folder an installed plugin's version `ref` is downloaded to. */
	codeFolder(id: string, ref: string): string {
		return join(dirname(configuration.get().databasePath), "plugins", id, ref);
	}

	/**
	 * The file a plugin starts from on this server: its one entry, or its build for this platform.
	 *
	 * @throws When it has no build for this server's platform.
	 */
	entryFor(manifest: PluginManifest): string {
		if (typeof manifest.entry === "string") {
			return manifest.entry;
		}
		const platform = `${process.platform}-${process.arch}`;
		const entry = manifest.entry[platform as keyof typeof manifest.entry];
		if (!entry) {
			throw new Error(`It has no build for this server (${platform}).`);
		}
		return entry;
	}

	/** Imports every installed plugin not loaded yet or at another version; a failing one is recorded, never thrown. */
	async loadInstalled(): Promise<void> {
		const rows = PluginDTO.all();
		const wanted = new Set(rows.map((row) => row.id));
		for (const hosted of this.all()) {
			if (!hosted.official && !wanted.has(hosted.manifest.id)) {
				await this.unload(hosted.manifest.id);
			}
		}
		for (const row of rows) {
			if (this.#hosted.get(row.id)?.ref === row.ref) {
				continue;
			}
			await this.load(row);
		}
	}

	/** Imports one installed plugin's code and puts it in place of the version loaded before; a failure is recorded. */
	async load(row: PluginDTO): Promise<void> {
		try {
			const manifest = parseManifest(row.manifest);
			const folder = this.codeFolder(row.id, row.ref);
			const entry = this.entryFor(manifest);
			const context = pluginContexts.create(manifest);
			let plugin: Plugin;
			if (manifest.runtime === "process") {
				await this.stop(row.id);
				plugin = await processPlugins.create(manifest, entry, folder, context);
			} else {
				const module = (await import(
					/* @vite-ignore */ join(folder, entry)
				)) as { default?: unknown };
				plugin = this.#check(module.default);
				await this.unload(row.id);
			}
			this.#hosted.get(row.id)?.context.dispose();
			this.#hosted.set(row.id, {
				manifest,
				plugin,
				official: false,
				ref: row.ref,
				context,
			});
			this.#failures.delete(row.id);
		} catch (error) {
			logger.warn("Plugin failed to load", { plugin: row.id }, error);
			this.#failures.set(
				row.id,
				error instanceof Error ? error.message : "It failed to load.",
			);
		}
	}

	/** Stops and forgets an installed plugin. */
	async unload(id: string): Promise<void> {
		await this.stop(id);
		processPlugins.kill(id);
		this.#hosted.get(id)?.context.dispose();
		this.#hosted.delete(id);
		this.#failures.delete(id);
	}

	/** Starts the long-running side of `id` (connections, timers) when it's turned on; a failure is logged. */
	async start(id: string): Promise<void> {
		const hosted = this.get(id);
		if (!hosted || this.#running.has(id) || !this.enabled(id)) {
			return;
		}
		this.#running.add(id);
		try {
			await hosted.plugin.start?.(hosted.context);
		} catch (error) {
			logger.warn("Plugin failed to start", { plugin: id }, error);
		}
	}

	/** Stops the long-running side of `id`, clearing its timers and subscriptions; a failure is logged. */
	async stop(id: string): Promise<void> {
		const hosted = this.#hosted.get(id);
		if (!hosted || !this.#running.delete(id)) {
			return;
		}
		try {
			await hosted.plugin.stop?.();
		} catch (error) {
			logger.warn("Plugin failed to stop", { plugin: id }, error);
		}
		hosted.context.dispose();
	}

	/** Stops then starts `id`, after its settings changed or an admin turned it on or off. */
	async restart(id: string): Promise<void> {
		await this.stop(id);
		await this.start(id);
	}

	/** Starts every plugin that's turned on. */
	async startAll(): Promise<void> {
		for (const hosted of this.all()) {
			await this.start(hosted.manifest.id);
		}
	}

	/** Stops every running plugin, for the worker's shutdown. */
	async stopAll(): Promise<void> {
		for (const id of [...this.#running]) {
			await this.stop(id);
		}
	}

	#loadOfficial(): void {
		if (this.#officialLoaded) {
			return;
		}
		this.#officialLoaded = true;
		for (const entry of officialPlugins) {
			const manifest = parseManifest(entry.manifest);
			this.#hosted.set(manifest.id, {
				manifest,
				plugin: this.#check(entry.plugin),
				official: true,
				ref: null,
				context: pluginContexts.create(manifest),
			});
		}
	}

	#repository(id: string): string {
		return PluginDTO.find(id)?.repository ?? officialRepository;
	}

	#check(candidate: unknown): Plugin {
		if (!candidate || typeof candidate !== "object") {
			throw new Error("Its code doesn't export a plugin as default.");
		}
		for (const hook of hooks) {
			const value = (candidate as Record<string, unknown>)[hook];
			if (value !== undefined && typeof value !== "function") {
				throw new Error(`Its ${hook} isn't a function.`);
			}
		}
		return candidate as Plugin;
	}

	#version(version: string | undefined): number[] | null {
		const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? "");
		return match ? match.slice(1).map(Number) : null;
	}
}

export const plugins = new Plugins();
