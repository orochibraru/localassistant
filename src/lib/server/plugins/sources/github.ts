import { forgeHttp } from "#lib/server/plugins/sources/http.js";
import type {
	Forge,
	Location,
	Release,
	RepositoryInfo,
} from "#lib/server/plugins/sources/types.js";

const apiUrl = "https://api.github.com";
const rawUrl = "https://raw.githubusercontent.com";
const site = "GitHub";

interface RawRepository {
	full_name: string;
	description: string | null;
	html_url: string;
	stargazers_count: number;
	archived: boolean;
	pushed_at: string | null;
	default_branch: string;
}

/** github.com: its API, raw files for public repositories and the contents API with a token for private ones. */
class GitHubForge implements Forge {
	/** The repository, folder and branch or tag in a github.com link's path: `owner/repo[/tree/<ref>/<folder>]`. */
	parse(
		_origin: string,
		segments: string[],
	): Omit<Location, "kind" | "origin"> {
		const [owner = "", name = "", mode, ref, ...path] = segments;
		const inside = (mode === "tree" || mode === "blob") && ref;
		return {
			repository: `${owner}/${name.replace(/\.git$/i, "")}`,
			path: inside ? forgeHttp.cleanPath(path) : "",
			ref: inside ? ref : null,
		};
	}

	/** The repository's page, or its folder's at `branch`. */
	webUrl(location: Location, branch: string): string {
		const base = `https://github.com/${location.repository}`;
		return location.path ? `${base}/tree/${branch}/${location.path}` : base;
	}

	/**
	 * What GitHub says about the repository.
	 *
	 * @throws When the token can't read it, it doesn't exist, or GitHub can't be reached.
	 */
	async repository(
		location: Location,
		token: string | null,
	): Promise<RepositoryInfo> {
		const response = await this.#api(`/repos/${location.repository}`, token);
		if (response.status === 404) {
			throw new Error(
				token
					? "GitHub has no repository at that link the token can read. Check the link, and that the token may read that repository."
					: "GitHub has no public repository at that link. Check it for typos; for a private one, save a token for github.com first.",
			);
		}
		const raw = (await response.json()) as RawRepository;
		return {
			repository: raw.full_name,
			description: raw.description ?? "",
			url: raw.html_url,
			stars: raw.stargazers_count,
			archived: raw.archived,
			pushedAt: raw.pushed_at,
			defaultBranch: raw.default_branch,
		};
	}

	/**
	 * The newest release, or `null` when it never published one.
	 *
	 * @throws When GitHub can't be reached.
	 */
	async latestRelease(
		location: Location,
		token: string | null,
	): Promise<Release | null> {
		const response = await this.#api(
			`/repos/${location.repository}/releases/latest`,
			token,
		);
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
	 * @throws When the ref doesn't exist or GitHub can't be reached.
	 */
	async commit(
		location: Location,
		ref: string,
		token: string | null,
	): Promise<string> {
		const response = await this.#api(
			`/repos/${location.repository}/commits/${encodeURIComponent(ref)}`,
			token,
			"application/vnd.github.sha",
		);
		if (response.status === 404 || response.status === 422) {
			throw new Error(`The repository has no branch or tag named ${ref}.`);
		}
		const sha = (await response.text()).trim();
		if (!/^[0-9a-f]{40}$/.test(sha)) {
			throw new Error("GitHub answered with something that isn't a commit.");
		}
		return sha;
	}

	/**
	 * A file at commit `sha`, or `null` when there's none.
	 *
	 * @throws When GitHub can't be reached or the file is over 64 MB.
	 */
	async download(
		location: Location,
		sha: string,
		path: string,
		token: string | null,
	): Promise<Uint8Array | null> {
		const encoded = forgeHttp.encodePath(path);
		const response = token
			? await this.#api(
					`/repos/${location.repository}/contents/${encoded}?ref=${sha}`,
					token,
					"application/vnd.github.raw",
				)
			: await forgeHttp.get(
					`${rawUrl}/${location.repository}/${sha}/${encoded}`,
					{},
					site,
				);
		return forgeHttp.bytes(response, path);
	}

	/**
	 * Checks `token` signs in to GitHub.
	 *
	 * @throws When GitHub refuses it or can't be reached.
	 */
	checkToken(_origin: string, token: string): Promise<void> {
		return forgeHttp.checkToken(`${apiUrl}/user`, this.#headers(token), site);
	}

	/**
	 * Public repositories tagged as LocalAssistant plugins, most starred first.
	 *
	 * @throws When GitHub can't be reached or limits this server.
	 */
	async search(): Promise<RepositoryInfo[]> {
		const query = new URLSearchParams({
			q: "topic:localassistant-plugin archived:false",
			sort: "stars",
			order: "desc",
			per_page: "30",
		});
		const response = await this.#api(`/search/repositories?${query}`, null);
		const body = (await response.json()) as { items?: RawRepository[] };
		return (body.items ?? []).map((raw) => ({
			repository: raw.full_name,
			description: raw.description ?? "",
			url: raw.html_url,
			stars: raw.stargazers_count,
			archived: raw.archived,
			pushedAt: raw.pushed_at,
			defaultBranch: raw.default_branch,
		}));
	}

	#headers(
		token: string | null,
		accept = "application/vnd.github+json",
	): Record<string, string> {
		return {
			Accept: accept,
			"X-GitHub-Api-Version": "2022-11-28",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		};
	}

	async #api(
		path: string,
		token: string | null,
		accept?: string,
	): Promise<Response> {
		const response = await forgeHttp.get(
			`${apiUrl}${path}`,
			this.#headers(token, accept),
			site,
		);
		return forgeHttp.check(response, site, token);
	}
}

export const gitHubForge = new GitHubForge();
