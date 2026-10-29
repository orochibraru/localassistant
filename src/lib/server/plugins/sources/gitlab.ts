import { forgeHttp } from "#lib/server/plugins/sources/http.js";
import type {
	Forge,
	Location,
	Release,
	RepositoryInfo,
} from "#lib/server/plugins/sources/types.js";

interface RawProject {
	path_with_namespace: string;
	description: string | null;
	web_url: string;
	star_count: number;
	archived?: boolean;
	last_activity_at: string | null;
	default_branch: string | null;
}

/** GitLab, gitlab.com or self-hosted, through its v4 API; a token goes in `PRIVATE-TOKEN`. */
class GitLabForge implements Forge {
	/** The project, folder and ref in a GitLab link's path: `group/sub/project[/-/tree/<ref>/<folder>]`. */
	parse(
		_origin: string,
		segments: string[],
	): Omit<Location, "kind" | "origin"> {
		const split = segments.indexOf("-");
		const project = split === -1 ? segments : segments.slice(0, split);
		const [mode, ref, ...path] = split === -1 ? [] : segments.slice(split + 1);
		const inside = (mode === "tree" || mode === "blob") && ref;
		return {
			repository: project.join("/").replace(/\.git$/i, ""),
			path: inside ? forgeHttp.cleanPath(path) : "",
			ref: inside ? ref : null,
		};
	}

	/** The project's page, or its folder's at `branch`. */
	webUrl(location: Location, branch: string): string {
		const base = `${location.origin}/${location.repository}`;
		return location.path ? `${base}/-/tree/${branch}/${location.path}` : base;
	}

	/**
	 * What GitLab says about the project.
	 *
	 * @throws When the token can't read it, it doesn't exist, or GitLab can't be reached.
	 */
	async repository(
		location: Location,
		token: string | null,
	): Promise<RepositoryInfo> {
		const response = await this.#api(location, "", token);
		if (response.status === 404) {
			throw new Error(
				token
					? `${this.#site(location.origin)} has no project at that link the token can read.`
					: `${this.#site(location.origin)} has no public project at that link. For a private one, save a token for it first.`,
			);
		}
		return this.#info((await response.json()) as RawProject);
	}

	/**
	 * The newest release, or `null` when it never published one.
	 *
	 * @throws When GitLab can't be reached.
	 */
	async latestRelease(
		location: Location,
		token: string | null,
	): Promise<Release | null> {
		const response = await this.#api(
			location,
			"/releases/permalink/latest",
			token,
		);
		if (response.status === 404) {
			return null;
		}
		const body = (await response.json()) as {
			tag_name: string;
			released_at: string | null;
		};
		return { tag: body.tag_name, publishedAt: body.released_at };
	}

	/**
	 * The commit a branch, tag or commit points at.
	 *
	 * @throws When the ref doesn't exist or GitLab can't be reached.
	 */
	async commit(
		location: Location,
		ref: string,
		token: string | null,
	): Promise<string> {
		const response = await this.#api(
			location,
			`/repository/commits/${encodeURIComponent(ref)}`,
			token,
		);
		if (response.status === 404) {
			throw new Error(`The project has no branch or tag named ${ref}.`);
		}
		const body = (await response.json()) as { id?: string };
		if (!body.id || !/^[0-9a-f]{40}$/.test(body.id)) {
			throw new Error("GitLab answered with something that isn't a commit.");
		}
		return body.id;
	}

	/**
	 * A file at commit `sha`, or `null` when there's none.
	 *
	 * @throws When GitLab can't be reached or the file is over 64 MB.
	 */
	async download(
		location: Location,
		sha: string,
		path: string,
		token: string | null,
	): Promise<Uint8Array | null> {
		const response = await this.#api(
			location,
			`/repository/files/${encodeURIComponent(path)}/raw?ref=${sha}`,
			token,
		);
		return forgeHttp.bytes(response, path);
	}

	/**
	 * Checks `token` signs in to the GitLab at `origin`.
	 *
	 * @throws When it refuses the token or can't be reached.
	 */
	checkToken(origin: string, token: string): Promise<void> {
		return forgeHttp.checkToken(
			`${origin}/api/v4/user`,
			{ "PRIVATE-TOKEN": token },
			this.#site(origin),
		);
	}

	/**
	 * Public projects on gitlab.com tagged as LocalAssistant plugins, most starred first.
	 *
	 * @throws When gitlab.com can't be reached.
	 */
	async search(): Promise<RepositoryInfo[]> {
		const query = new URLSearchParams({
			topic: "localassistant-plugin",
			order_by: "star_count",
			sort: "desc",
			per_page: "30",
			archived: "false",
		});
		const response = forgeHttp.check(
			await forgeHttp.get(
				`https://gitlab.com/api/v4/projects?${query}`,
				{},
				"gitlab.com",
			),
			"gitlab.com",
			null,
		);
		return ((await response.json()) as RawProject[]).map((raw) =>
			this.#info(raw),
		);
	}

	#info(raw: RawProject): RepositoryInfo {
		return {
			repository: raw.path_with_namespace,
			description: raw.description ?? "",
			url: raw.web_url,
			stars: raw.star_count,
			archived: raw.archived ?? false,
			pushedAt: raw.last_activity_at,
			defaultBranch: raw.default_branch ?? "main",
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
			`${location.origin}/api/v4/projects/${encodeURIComponent(location.repository)}${path}`,
			token ? { "PRIVATE-TOKEN": token } : {},
			site,
		);
		return forgeHttp.check(response, site, token);
	}
}

export const gitLabForge = new GitLabForge();
