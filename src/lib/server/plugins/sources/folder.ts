import { stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type {
	Forge,
	Location,
	Release,
	RepositoryInfo,
} from "#lib/server/plugins/sources/types.js";

const manifestFile = "localassistant-plugin.json";

/**
 * A plugin in a folder on this server, a mounted volume: no git, no releases. Its version is a digest of its manifest
 * and the files it declares, so changing them offers an update.
 */
class FolderSource implements Forge {
	/** The folder an absolute path or `file://` link names. */
	parse(
		_origin: string,
		segments: string[],
	): Omit<Location, "kind" | "origin"> {
		return { repository: resolve("/", ...segments), path: "", ref: null };
	}

	/** Folders have no web page. */
	webUrl(): null {
		return null;
	}

	/**
	 * The folder, as long as it holds a manifest.
	 *
	 * @throws When the folder or its manifest isn't there.
	 */
	async repository(location: Location): Promise<RepositoryInfo> {
		const manifest = await stat(join(location.repository, manifestFile)).catch(
			() => null,
		);
		if (!manifest?.isFile()) {
			throw new Error(
				`There's no ${manifestFile} in ${location.repository} on this server. With Docker, mount the folder into the container first.`,
			);
		}
		return {
			repository: location.repository,
			description: "",
			url: null,
			stars: null,
			archived: false,
			pushedAt: manifest.mtime.toISOString(),
			defaultBranch: "local",
		};
	}

	/** Folders have no releases. */
	latestRelease(): Promise<Release | null> {
		return Promise.resolve(null);
	}

	/**
	 * A digest of the manifest and every file it names, standing in for a commit.
	 *
	 * @throws When the manifest can't be read.
	 */
	async commit(location: Location): Promise<string> {
		const raw = await Bun.file(join(location.repository, manifestFile)).text();
		let manifest: { entry?: unknown; files?: unknown } = {};
		try {
			manifest = JSON.parse(raw) as typeof manifest;
		} catch {
			manifest = {};
		}
		const entries =
			typeof manifest.entry === "string"
				? [manifest.entry]
				: manifest.entry && typeof manifest.entry === "object"
					? Object.values(manifest.entry).map(String)
					: ["dist/index.js"];
		const files = Array.isArray(manifest.files)
			? manifest.files.map(String)
			: [];
		const hasher = new Bun.CryptoHasher("sha1");
		hasher.update(raw);
		for (const file of [...new Set([...entries, ...files])].toSorted()) {
			const path = this.#inside(location.repository, file);
			const content = path
				? await Bun.file(path)
						.bytes()
						.catch(() => null)
				: null;
			hasher.update(`\0${file}\0`);
			hasher.update(content ?? new Uint8Array());
		}
		return hasher.digest("hex");
	}

	/** A file of the folder, or `null` when it isn't there or would be outside it. */
	async download(
		location: Location,
		_sha: string,
		path: string,
	): Promise<Uint8Array | null> {
		const file = this.#inside(location.repository, path);
		return file
			? Bun.file(file)
					.bytes()
					.catch(() => null)
			: null;
	}

	/** Folders take no token. */
	checkToken(): Promise<void> {
		return Promise.reject(new Error("A folder on this server needs no token."));
	}

	#inside(folder: string, path: string): string | null {
		const file = resolve(folder, path);
		const offset = relative(folder, file);
		return offset && !offset.startsWith("..") && !isAbsolute(offset)
			? file
			: null;
	}
}

export const folderSource = new FolderSource();
