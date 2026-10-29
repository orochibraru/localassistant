import { forgeHttp } from "#lib/server/plugins/sources/http.js";
import type {
	Forge,
	Location,
	Release,
	RepositoryInfo,
} from "#lib/server/plugins/sources/types.js";

interface RawRepository {
	full_name: string;
	description: string | null;
	html_url: string;
	stars_count: number;
	archived: boolean;
	updated_at: string | null;
	default_branch: string;
}

/** Gitea and Forgejo (Codeberg included), self-hosted or not, through their v1 API; a token goes in `Authorization: token`. */
class GiteaForge implements Forge {
	/** The repository, folder and ref in a link's path: `owner/repo[/src/branch|tag|commit/<ref>/<folder>]`. */
	parse(
		_origin: string,
		segments: string[],
	): Omit<Location, "kind" | "origin"> {
		const [owner = "", name = "", mode, flavour, ref, ...path] = segments;
		const inside =
			mode === "src" &&
			["branch", "tag", "commit"].includes(flavour ?? "") &&
			ref;
		return {
			repository: `${owner}/${name.replace(/\.git$/i, "")}`,
			path: inside ? forgeHttp.cleanPath(path) : "",
			ref: inside ? ref : null,
		};
	}

	/** The repository's page, or its folder's on `branch`. */
	webUrl(location: Location, branch: string): string {
		const base = `${location.origin}/${location.repository}`;
		return location.path
			? `${base}/src/branch/${branch}/${location.path}`
			: base;
	}

	/**
	 * What the server says about the repository.
	 *
	 * @throws When the token can't read it, it doesn't exist, or the server can't be reached.
	 */
	async repository(
		location: Location,
		token: string | null,
	): Promise<RepositoryInfo> {
		const response = await this.#api(location, "", token);
		if (response.status === 404) {
			throw new Error(
				token
					? `${this.#site(location.origin)} has no repository at that link the token can read.`
					: `${this.#site(location.origin)} has no public repository at that link. For a private one, save a token for it first.`,
			);
		}
		return this.#info((await response.json()) as RawRepository);
	}

	/**
	 * The newest release, or `null` when it never published one.
	 *
	 * @throws When the server can't be reached.
	 */
	async latestRelease(
		location: Location,
		token: string | null,
	): Promise<Release | null> {
		const response = await this.#api(location, "/releases/latest", token);
		if (response.status === 404) {
			return null;
		}
		const body = (await response.json()) as {
			tag_name: string;
			published_at: string | null;
		};
		return { tag: body.tag_name, publishedAt: body.published_at };
	}

	/**
	 * The commit a branch, tag or commit points at.
	 *
	 * @throws When the ref doesn't exist or the server can't be reached.
	 */
	async commit(
		location: Location,
		ref: string,
		token: string | null,
	): Promise<string> {
		const query = new URLSearchParams({
			sha: ref,
			limit: "1",
			stat: "false",
			verification: "false",
			files: "false",
		});
		const response = await this.#api(location, `/commits?${query}`, token);
		const body = response.ok
			? ((await response.json()) as { sha?: string }[])
			: [];
		const sha = body[0]?.sha;
		if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
			throw new Error(`The repository has no branch or tag named ${ref}.`);
		}
		return sha;
	}

	/**
	 * A file at commit `sha`, or `null` when there's none.
	 *
	 * @throws When the server can't be reached or the file is over 64 MB.
	 */
	async download(
		location: Location,
		sha: string,
		path: string,
		token: string | null,
	): Promise<Uint8Array | null> {
		const response = await this.#api(
			location,
			`/raw/${forgeHttp.encodePath(path)}?ref=${sha}`,
			token,
		);
		return forgeHttp.bytes(response, path);
	}

	/**
	 * Checks `token` signs in to the server at `origin`.
	 *
	 * @throws When it refuses the token or can't be reached.
	 */
	checkToken(origin: string, token: string): Promise<void> {
		return forgeHttp.checkToken(
			`${origin}/api/v1/user`,
			{ Authorization: `token ${token}` },
			this.#site(origin),
		);
	}

	/**
	 * Public repositories on Codeberg tagged as LocalAssistant plugins, most starred first.
	 *
	 * @throws When Codeberg can't be reached.
	 */
	async search(): Promise<RepositoryInfo[]> {
		const query = new URLSearchParams({
			q: "localassistant-plugin",
			topic: "true",
			sort: "stars",
			order: "desc",
			limit: "30",
		});
		const response = forgeHttp.check(
			await forgeHttp.get(
				`https://codeberg.org/api/v1/repos/search?${query}`,
				{},
				"codeberg.org",
			),
			"codeberg.org",
			null,
		);
		const body = (await response.json()) as { data?: RawRepository[] };
		return (body.data ?? [])
			.filter((raw) => !raw.archived)
			.map((raw) => this.#info(raw));
	}

	#info(raw: RawRepository): RepositoryInfo {
		return {
			repository: raw.full_name,
			description: raw.description ?? "",
			url: raw.html_url,
			stars: raw.stars_count,
			archived: raw.archived,
			pushedAt: raw.updated_at,
			defaultBranch: raw.default_branch,
		};
	}

	#site(origin: string): string {
		return new URL(origin).host;
	}

	async #api(
		location: Location,
		path: string,
		token: string | null,
	): Promise<Response> {
		const site = this.#site(location.origin);
		const response = await forgeHttp.get(
			`${location.origin}/api/v1/repos/${location.repository}${path}`,
			token ? { Authorization: `token ${token}` } : {},
			site,
		);
		return forgeHttp.check(response, site, token);
	}
}

export const giteaForge = new GiteaForge();
