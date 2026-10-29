import { getSetting } from "#lib/dto/setting.js";
import type { PluginHealth } from "#lib/plugins.js";
import { secrets } from "#lib/server/core/secrets.js";

const apiUrl = "https://api.github.com";
const rawUrl = "https://raw.githubusercontent.com";
const requestTimeoutMs = 15_000;
const largestFileBytes = 64 * 1024 * 1024;
const dayMs = 24 * 60 * 60_000;

export const pluginTopic = "localassistant-plugin";

export interface PluginSource {
	repository: string;
	path: string;
	ref: string | null;
}

export interface RepositoryInfo {
	repository: string;
	description: string;
	url: string;
	stars: number;
	archived: boolean;
	pushedAt: string | null;
	defaultBranch: string;
}

export interface Release {
	tag: string;
	publishedAt: string | null;
}

interface RawRepository {
	full_name: string;
	description: string | null;
	html_url: string;
	stargazers_count: number;
	archived: boolean;
	pushed_at: string | null;
	default_branch: string;
}

/**
 * GitHub's API and raw files: where plugins are found, checked and downloaded. Anonymous by default; with the token an
 * admin saved, private repositories are reachable and the hourly limit is GitHub's signed-in one.
 */
class GitHub {
	/**
	 * The repository, folder and branch or tag a link points at; takes `owner/repo`, a github.com page link in any form,
	 * or a git clone address.
	 *
	 * @throws When the link isn't one to a GitHub repository.
	 */
	parseLink(link: string): PluginSource {
		const cleaned = link
			.trim()
			.replace(/^git@github\.com:/i, "github.com/")
			.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
			.replace(/[?#].*$/, "")
			.replace(/\/+$/, "");
		const [owner, rawName, mode, ref, ...path] = cleaned.split("/");
		const name = rawName?.replace(/\.git$/i, "");
		const valid = /^[A-Za-z0-9_.-]{1,100}$/;
		if (!owner || !name || !valid.test(owner) || !valid.test(name)) {
			throw new Error(
				"That isn't a link to a GitHub repository. It looks like github.com/someone/something.",
			);
		}
		const pointsInside = (mode === "tree" || mode === "blob") && ref;
		return {
			repository: `${owner}/${name}`,
			path: pointsInside
				? path
						.filter((part) => part !== "localassistant-plugin.json")
						.filter((part) => part && part !== "." && part !== "..")
						.join("/")
				: "",
			ref: pointsInside ? ref : null,
		};
	}

	/**
	 * What GitHub says about `repository`.
	 *
	 * @throws When it doesn't exist, is private, or GitHub can't be reached.
	 */
	async repository(repository: string): Promise<RepositoryInfo> {
		const response = await this.#api(`/repos/${repository}`);
		if (response.status === 404) {
			throw new Error(
				this.#token()
					? "GitHub has no repository at that link the token can read. Check the link, and that the token may read that repository."
					: "GitHub has no public repository at that link. Check it for typos; for a private one, save a GitHub token first.",
			);
		}
		return this.#info((await response.json()) as RawRepository);
	}

	/**
	 * The newest release of `repository`, or `null` when it never published one.
	 *
	 * @throws When GitHub can't be reached.
	 */
	async latestRelease(repository: string): Promise<Release | null> {
		const response = await this.#api(`/repos/${repository}/releases/latest`);
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
	 * The commit a branch, tag or commit of `repository` points at.
	 *
	 * @throws When the ref doesn't exist or GitHub can't be reached.
	 */
	async commit(repository: string, ref: string): Promise<string> {
		const response = await this.#api(
			`/repos/${repository}/commits/${encodeURIComponent(ref)}`,
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
	 * A text file of `repository` at commit `sha`, or `null` when it has none there.
	 *
	 * @throws When GitHub can't be reached or the file is over 64 MB.
	 */
	async file(
		repository: string,
		sha: string,
		path: string,
	): Promise<string | null> {
		const bytes = await this.download(repository, sha, path);
		return bytes === null ? null : new TextDecoder().decode(bytes);
	}

	/**
	 * A file of `repository` at commit `sha` as bytes, a plugin's binary included, or `null` when it has none there.
	 *
	 * @throws When GitHub can't be reached or the file is over 64 MB.
	 */
	async download(
		repository: string,
		sha: string,
		path: string,
	): Promise<Uint8Array | null> {
		const encoded = path.split("/").map(encodeURIComponent).join("/");
		const response = this.#token()
			? await this.#api(
					`/repos/${repository}/contents/${encoded}?ref=${sha}`,
					"application/vnd.github.raw",
				)
			: await this.#fetch(`${rawUrl}/${repository}/${sha}/${encoded}`, {});
		if (response.status === 404) {
			return null;
		}
		if (!response.ok) {
			throw new Error(`GitHub answered ${response.status} for ${path}.`);
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length > largestFileBytes) {
			throw new Error(`${path} is over 64 MB.`);
		}
		return bytes;
	}

	/**
	 * Public repositories tagged as LocalAssistant plugins, most starred first.
	 *
	 * @throws When GitHub can't be reached or limits this server.
	 */
	async search(): Promise<RepositoryInfo[]> {
		const query = new URLSearchParams({
			q: `topic:${pluginTopic} archived:false`,
			sort: "stars",
			order: "desc",
			per_page: "30",
		});
		const response = await this.#api(`/search/repositories?${query}`);
		const body = (await response.json()) as { items?: RawRepository[] };
		return (body.items ?? []).map((item) => this.#info(item));
	}

	/** How looked after a repository is, from whether it's archived and when it last changed. */
	health(
		info: Pick<RepositoryInfo, "archived" | "pushedAt">,
		now = Date.now(),
	): PluginHealth {
		if (info.archived) {
			return "archived";
		}
		if (!info.pushedAt) {
			return "unknown";
		}
		const age = now - Date.parse(info.pushedAt);
		if (age < 183 * dayMs) {
			return "maintained";
		}
		return age < 365 * dayMs ? "quiet" : "unmaintained";
	}

	#info(raw: RawRepository): RepositoryInfo {
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
	 * Checks `token` signs in to GitHub.
	 *
	 * @throws When GitHub refuses it or can't be reached.
	 */
	async checkToken(token: string): Promise<void> {
		const response = await this.#fetch(`${apiUrl}/user`, {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
		});
		if (response.status === 401) {
			throw new Error(
				"GitHub refused that token. Check it wasn't revoked or expired.",
			);
		}
		if (!response.ok) {
			throw new Error(`GitHub answered ${response.status}.`);
		}
	}

	#token(): string | null {
		const saved = getSetting("githubToken");
		return saved ? secrets.decrypt(saved.encryptedToken) : null;
	}

	async #api(
		path: string,
		accept = "application/vnd.github+json",
	): Promise<Response> {
		const token = this.#token();
		const response = await this.#fetch(`${apiUrl}${path}`, {
			Accept: accept,
			"X-GitHub-Api-Version": "2022-11-28",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		});
		if (response.status === 401 && token) {
			throw new Error(
				"GitHub refused the saved token: it was revoked or expired. Save a new one in Admin, Integrations.",
			);
		}
		if (
			response.status === 429 ||
			(response.status === 403 &&
				response.headers.get("x-ratelimit-remaining") === "0")
		) {
			throw new Error(
				"GitHub is limiting requests from this server. Try again in an hour.",
			);
		}
		if (!response.ok && response.status !== 404 && response.status !== 422) {
			throw new Error(`GitHub answered ${response.status}.`);
		}
		return response;
	}

	async #fetch(
		url: string,
		headers: Record<string, string>,
	): Promise<Response> {
		try {
			return await fetch(url, {
				headers: { "User-Agent": "LocalAssistant", ...headers },
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
		} catch (error) {
			throw new Error("GitHub can't be reached from this server right now.", {
				cause: error,
			});
		}
	}
}

export const gitHub = new GitHub();
