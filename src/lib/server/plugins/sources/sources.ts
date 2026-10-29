import { getSetting, setSetting } from "#lib/dto/setting.js";
import type { PluginHealth, PluginSourceKind } from "#lib/plugins.js";
import { secrets } from "#lib/server/core/secrets.js";
import { folderSource } from "#lib/server/plugins/sources/folder.js";
import { giteaForge } from "#lib/server/plugins/sources/gitea.js";
import { gitHubForge } from "#lib/server/plugins/sources/github.js";
import { gitLabForge } from "#lib/server/plugins/sources/gitlab.js";
import { forgeHttp } from "#lib/server/plugins/sources/http.js";
import type {
	Forge,
	Location,
	RepositoryInfo,
} from "#lib/server/plugins/sources/types.js";

const dayMs = 24 * 60 * 60_000;
const gitHubOrigin = "https://github.com";

const knownSites: Record<string, PluginSourceKind> = {
	"github.com": "github",
	"www.github.com": "github",
	"gitlab.com": "gitlab",
	"codeberg.org": "gitea",
	"gitea.com": "gitea",
};

const notALink =
	"That isn't a link to a repository or a folder. It looks like github.com/someone/something, gitlab.com/group/project, codeberg.org/someone/something or /plugins/my-integration.";

export interface Listing extends RepositoryInfo {
	kind: PluginSourceKind;
	origin: string;
}

/**
 * Where plugins come from: GitHub, GitLab and Gitea or Forgejo, hosted or self-hosted, and folders on this server.
 * Reads any link a person pastes, recognises the site, and keeps one token per site.
 */
class PluginSources {
	/** The source that reads locations of `kind`. */
	forge(kind: PluginSourceKind): Forge {
		return {
			github: gitHubForge,
			gitlab: gitLabForge,
			gitea: giteaForge,
			folder: folderSource,
		}[kind];
	}

	/**
	 * The location a pasted link points at: a repository page, a folder or branch inside it, a clone address,
	 * `owner/repo` for GitHub, or an absolute path on this server. Asks an unknown site which software it runs.
	 *
	 * @throws When it isn't a link, or the site is none LocalAssistant can read.
	 */
	async locate(link: string): Promise<Location> {
		const trimmed = link.trim();
		if (trimmed.startsWith("/") || /^file:\/\//i.test(trimmed)) {
			const path = decodeURIComponent(trimmed.replace(/^file:\/\//i, ""));
			if (!path.startsWith("/")) {
				throw new Error(notALink);
			}
			return {
				kind: "folder",
				origin: "",
				...folderSource.parse("", path.split("/")),
			};
		}
		let text = trimmed.replace(/^git@([^:/]+):/i, "https://$1/");
		if (!/^https?:\/\//i.test(text)) {
			const first = text.split("/")[0] ?? "";
			text =
				first.includes(".") || first.includes(":")
					? `https://${text}`
					: `${gitHubOrigin}/${text}`;
		}
		let url: URL;
		try {
			url = new URL(text);
		} catch {
			throw new Error(notALink);
		}
		const segments = url.pathname.split("/").filter(Boolean);
		const valid = /^[A-Za-z0-9_.-]{1,100}$/;
		if (
			segments.length < 2 ||
			!segments.slice(0, 2).every((part) => valid.test(part))
		) {
			throw new Error(notALink);
		}
		const origin =
			knownSites[url.host] === "github" ? gitHubOrigin : url.origin;
		const kind = await this.#kindOf(origin);
		return { kind, origin, ...this.forge(kind).parse(origin, segments) };
	}

	/** How an installed plugin's location is stored: `<kind>:<origin>/<repository>`, or `folder:<path>`. */
	key(location: Pick<Location, "kind" | "origin" | "repository">): string {
		return location.kind === "folder"
			? `folder:${location.repository}`
			: `${location.kind}:${location.origin}/${location.repository}`;
	}

	/** The location a stored key and folder name, its newest version wanted. */
	fromKey(key: string, path: string): Location {
		const split = key.indexOf(":");
		const kind = key.slice(0, split) as PluginSourceKind;
		const rest = key.slice(split + 1);
		if (kind === "folder") {
			return { kind, origin: "", repository: rest, path, ref: null };
		}
		const url = new URL(rest);
		return {
			kind,
			origin: url.origin,
			repository: url.pathname.slice(1),
			path,
			ref: null,
		};
	}

	/** The site a location is on, as a person reads it: its host, or "this server" for a folder. */
	site(location: Pick<Location, "kind" | "origin">): string {
		return location.kind === "folder"
			? "this server"
			: new URL(location.origin).host;
	}

	/** The token saved for the site at `origin`, decrypted, or `null`. */
	token(origin: string): string | null {
		const saved = getSetting("sourceTokens").find(
			(entry) => entry.site === origin,
		);
		return saved ? secrets.decrypt(saved.encryptedToken) : null;
	}

	/** The sites a token is saved for. */
	tokenSites(): string[] {
		return getSetting("sourceTokens").map((entry) => entry.site);
	}

	/**
	 * Checks `token` with the site named by `site` (a host or an address) and saves it encrypted, replacing any
	 * token that site had; returns the site's origin.
	 *
	 * @throws When the site can't be recognised or reached, or refuses the token.
	 */
	async saveToken(site: string, token: string): Promise<string> {
		const origin = this.origin(site);
		const kind = await this.#kindOf(origin);
		await this.forge(kind).checkToken(origin, token);
		setSetting("sourceTokens", [
			...getSetting("sourceTokens").filter((entry) => entry.site !== origin),
			{ site: origin, encryptedToken: secrets.encrypt(token) },
		]);
		return origin;
	}

	/** Forgets the token of the site named by `site`. */
	removeToken(site: string): void {
		const origin = this.origin(site);
		setSetting(
			"sourceTokens",
			getSetting("sourceTokens").filter((entry) => entry.site !== origin),
		);
	}

	/**
	 * The origin of a site a person typed: `gitlab.com`, `https://git.example.com/` or `http://192.168.1.5:3000`.
	 *
	 * @throws When it isn't a site address.
	 */
	origin(site: string): string {
		const text = /^https?:\/\//i.test(site.trim())
			? site.trim()
			: `https://${site.trim()}`;
		let url: URL;
		try {
			url = new URL(text);
		} catch {
			throw new Error(
				"Type the site's address, like gitlab.com or https://git.example.com.",
			);
		}
		return knownSites[url.host] === "github" ? gitHubOrigin : url.origin;
	}

	/** How looked after a plugin's source is: a folder is local, a repository archived or by when it last changed. */
	health(
		info: Pick<RepositoryInfo, "archived" | "pushedAt">,
		kind: PluginSourceKind,
		now = Date.now(),
	): PluginHealth {
		if (kind === "folder") {
			return "local";
		}
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

	/**
	 * Public plugins tagged `localassistant-plugin` on GitHub, gitlab.com and Codeberg, most starred first; a site
	 * that can't be reached is left out.
	 *
	 * @throws When none of them can be reached.
	 */
	async search(): Promise<Listing[]> {
		const sources: [PluginSourceKind, string][] = [
			["github", gitHubOrigin],
			["gitlab", "https://gitlab.com"],
			["gitea", "https://codeberg.org"],
		];
		const results = await Promise.allSettled(
			sources.map(async ([kind, origin]) =>
				((await this.forge(kind).search?.()) ?? []).map((info) => ({
					...info,
					kind,
					origin,
				})),
			),
		);
		const found = results.flatMap((result) =>
			result.status === "fulfilled" ? result.value : [],
		);
		const failed = results.find((result) => result.status === "rejected");
		if (found.length === 0 && failed?.status === "rejected") {
			throw failed.reason instanceof Error
				? failed.reason
				: new Error("No site could be searched.");
		}
		return found.toSorted(
			(first, second) => (second.stars ?? 0) - (first.stars ?? 0),
		);
	}

	async #kindOf(origin: string): Promise<PluginSourceKind> {
		const known = knownSites[new URL(origin).host];
		if (known) {
			return known;
		}
		const site = new URL(origin).host;
		const gitea = await forgeHttp.get(`${origin}/api/v1/version`, {}, site);
		if (gitea.ok) {
			const body = (await gitea.json().catch(() => ({}))) as {
				version?: unknown;
			};
			if (typeof body.version === "string") {
				return "gitea";
			}
		}
		const gitLab = await forgeHttp.get(`${origin}/api/v4/version`, {}, site);
		if (gitLab.ok || gitLab.status === 401) {
			return "gitlab";
		}
		throw new Error(
			`${site} doesn't look like GitHub, GitLab, Gitea or Forgejo, the sites LocalAssistant installs from.`,
		);
	}
}

export const pluginSources = new PluginSources();
