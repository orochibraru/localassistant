import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PluginDTO } from "#lib/dto/plugin.js";
import { configuration } from "#lib/server/core/config.js";
import { pluginManager } from "#lib/server/plugins/manager.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { folderSource } from "#lib/server/plugins/sources/folder.js";
import { giteaForge } from "#lib/server/plugins/sources/gitea.js";
import { gitLabForge } from "#lib/server/plugins/sources/gitlab.js";
import { forgeHttp } from "#lib/server/plugins/sources/http.js";
import { pluginSources } from "#lib/server/plugins/sources/sources.js";

import { resetDatabase } from "../../database.js";

const manifest = (id: string, version = "1.0.0") => ({
	id,
	name: `${id} lamps`,
	description: "Lamps for the source tests.",
	version,
	icon: "lightbulb",
	kinds: [
		{ id: `${id}-lamp`, label: "Lamp", card: "switch", icon: "lightbulb" },
	],
});

const code = `export default { async read() { return { type: "switch", on: true, power: null, energy: null }; } };`;
const sha = (letter: string) => letter.repeat(40);
const token = "glpat-abcdefghijklmnop";

let root = "";
let originalPath = "";
const seen: { url: string; headers: Headers }[] = [];

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status });
}

function fakeForges(
	input: string | URL | Request,
	init?: RequestInit,
): Promise<Response> {
	const url = String(input);
	const headers = new Headers(init?.headers);
	seen.push({ url, headers });
	const gitlab = "https://gitlab.example.test/api/v4";
	const project = `${gitlab}/projects/${encodeURIComponent("home/plugins/lamps")}`;
	const forgejo = "http://forge.lan:3000/api/v1";
	const repo = `${forgejo}/repos/me/lamps`;
	if (url === `${forgejo}/version`) {
		return Promise.resolve(json({ version: "9.0.0+gitea-1.22" }));
	}
	if (url === `${gitlab}/version`) {
		return Promise.resolve(json({ message: "401 Unauthorized" }, 401));
	}
	if (url === `${gitlab}/user`) {
		return Promise.resolve(
			headers.get("private-token") === token ? json({ id: 1 }) : json({}, 401),
		);
	}
	if (url === `${forgejo}/user`) {
		return Promise.resolve(json({}, 403));
	}
	if (url.startsWith(project)) {
		if (headers.get("private-token") !== token) {
			return Promise.resolve(json({ message: "404 Project Not Found" }, 404));
		}
		const rest = url.slice(project.length);
		if (rest === "") {
			return Promise.resolve(
				json({
					path_with_namespace: "home/plugins/lamps",
					description: null,
					web_url: "https://gitlab.example.test/home/plugins/lamps",
					star_count: 2,
					last_activity_at: new Date().toISOString(),
					default_branch: "main",
				}),
			);
		}
		if (rest === "/releases/permalink/latest") {
			return Promise.resolve(json({ tag_name: "v2", released_at: null }));
		}
		if (
			rest === "/repository/commits/v2" ||
			rest === "/repository/commits/main"
		) {
			return Promise.resolve(json({ id: sha("1") }));
		}
		if (rest === "/repository/commits/missing") {
			return Promise.resolve(json({}, 404));
		}
		if (
			rest ===
			`/repository/files/${encodeURIComponent("lamp/localassistant-plugin.json")}/raw?ref=${sha("1")}`
		) {
			return Promise.resolve(json(manifest("gitlamps", "2.0.0")));
		}
		if (
			rest ===
			`/repository/files/${encodeURIComponent("lamp/dist/index.js")}/raw?ref=${sha("1")}`
		) {
			return Promise.resolve(new Response(code));
		}
	}
	if (url.startsWith(repo)) {
		const rest = url.slice(repo.length);
		if (rest === "") {
			return Promise.resolve(
				json({
					full_name: "me/lamps",
					description: "Forgejo lamps",
					html_url: "http://forge.lan:3000/me/lamps",
					stars_count: 0,
					archived: false,
					updated_at: "2020-01-01T00:00:00Z",
					default_branch: "trunk",
				}),
			);
		}
		if (rest === "/releases/latest") {
			return Promise.resolve(json({}, 404));
		}
		if (
			rest.startsWith("/commits?") &&
			new URL(url).searchParams.get("sha") === "trunk"
		) {
			return Promise.resolve(json([{ sha: sha("2") }]));
		}
		if (rest.startsWith("/commits?")) {
			return Promise.resolve(json([]));
		}
		if (rest === `/raw/localassistant-plugin.json?ref=${sha("2")}`) {
			return Promise.resolve(json(manifest("forgelamps")));
		}
		if (rest === `/raw/dist/index.js?ref=${sha("2")}`) {
			return Promise.resolve(new Response(code));
		}
	}
	if (url.startsWith("https://gitlab.com/api/v4/projects?")) {
		return Promise.resolve(
			json([
				{
					path_with_namespace: "someone/gl-lamps",
					description: "GitLab lamps",
					web_url: "https://gitlab.com/someone/gl-lamps",
					star_count: 5,
					last_activity_at: new Date().toISOString(),
					default_branch: "main",
				},
			]),
		);
	}
	if (url.startsWith("https://codeberg.org/api/v1/repos/search?")) {
		return Promise.resolve(
			json({
				data: [
					{
						full_name: "someone/cb-lamps",
						description: "",
						html_url: "https://codeberg.org/someone/cb-lamps",
						stars_count: 9,
						archived: false,
						updated_at: new Date().toISOString(),
						default_branch: "main",
					},
					{
						full_name: "someone/old",
						description: "",
						html_url: "https://codeberg.org/someone/old",
						stars_count: 1,
						archived: true,
						updated_at: null,
						default_branch: "main",
					},
				],
			}),
		);
	}
	if (url.startsWith("https://api.github.com/search/")) {
		return Promise.resolve(json({}, 500));
	}
	return Promise.resolve(json({}, 404));
}

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "localassistant-sources-"));
	originalPath = configuration.get().databasePath;
	configuration.get().databasePath = join(root, "localassistant.sqlite");
});

afterAll(async () => {
	configuration.get().databasePath = originalPath;
	await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
	resetDatabase();
	await plugins.loadInstalled();
	seen.length = 0;
	spyOn(globalThis, "fetch").mockImplementation(fakeForges as typeof fetch);
});

describe("plugin sources", () => {
	test("read GitLab, Gitea and Forgejo links in every shape, and recognise self-hosted sites", async () => {
		expect(
			await pluginSources.locate(
				"https://gitlab.com/group/sub/project/-/tree/v1/plugins/lamp",
			),
		).toEqual({
			kind: "gitlab",
			origin: "https://gitlab.com",
			repository: "group/sub/project",
			path: "plugins/lamp",
			ref: "v1",
		});
		expect(
			await pluginSources.locate("git@gitlab.com:group/project.git"),
		).toMatchObject({
			kind: "gitlab",
			repository: "group/project",
			ref: null,
		});
		expect(
			await pluginSources.locate(
				"codeberg.org/someone/lamps/src/branch/dev/lamp",
			),
		).toEqual({
			kind: "gitea",
			origin: "https://codeberg.org",
			repository: "someone/lamps",
			path: "lamp",
			ref: "dev",
		});
		expect(
			await pluginSources.locate("http://forge.lan:3000/me/lamps.git"),
		).toMatchObject({
			kind: "gitea",
			origin: "http://forge.lan:3000",
			repository: "me/lamps",
		});
		expect(
			await pluginSources.locate("gitlab.example.test/home/plugins/lamps"),
		).toMatchObject({
			kind: "gitlab",
			origin: "https://gitlab.example.test",
		});
		expect(await pluginSources.locate("file:///plugins/my%20lamps/")).toEqual({
			kind: "folder",
			origin: "",
			repository: "/plugins/my lamps",
			path: "",
			ref: null,
		});
		const keyed = await pluginSources.locate("http://forge.lan:3000/me/lamps");
		expect(pluginSources.key(keyed)).toBe(
			"gitea:http://forge.lan:3000/me/lamps",
		);
		expect(
			pluginSources.fromKey("gitea:http://forge.lan:3000/me/lamps", "lamp"),
		).toMatchObject({
			origin: "http://forge.lan:3000",
			repository: "me/lamps",
			path: "lamp",
		});
		expect(pluginSources.fromKey("folder:/plugins/lamps", "")).toMatchObject({
			kind: "folder",
			repository: "/plugins/lamps",
		});
		expect(pluginSources.site({ kind: "folder", origin: "" })).toBe(
			"this server",
		);
		expect(() => pluginSources.origin("not a site at all")).toThrow(
			"Type the site's address",
		);
		expect(
			gitLabForge.webUrl(
				{
					...keyed,
					kind: "gitlab",
					origin: "https://gitlab.com",
					repository: "g/p",
					path: "x",
				},
				"main",
			),
		).toBe("https://gitlab.com/g/p/-/tree/main/x");
		expect(giteaForge.webUrl({ ...keyed, path: "x" }, "trunk")).toBe(
			"http://forge.lan:3000/me/lamps/src/branch/trunk/x",
		);
		expect(folderSource.webUrl()).toBeNull();
	});

	test("installs from a private self-hosted GitLab with a saved token", async () => {
		const link =
			"https://gitlab.example.test/home/plugins/lamps/-/tree/main/lamp";
		await expect(pluginManager.preview(link)).rejects.toThrow(
			"gitlab.example.test has no public project at that link",
		);
		await expect(
			pluginSources.saveToken("gitlab.example.test", "glpat-wrongwrongwrong"),
		).rejects.toThrow("refused that token");
		expect(
			await pluginSources.saveToken("https://gitlab.example.test/", token),
		).toBe("https://gitlab.example.test");
		const preview = await pluginManager.preview(
			"https://gitlab.example.test/home/plugins/lamps/-/tree/main/lamp",
		);
		expect(preview).toMatchObject({
			site: "gitlab.example.test",
			repository: "home/plugins/lamps",
			ref: sha("1"),
			manifest: { id: "gitlamps", version: "2.0.0" },
		});
		expect(preview.ref).toBe(sha("1"));
		await expect(
			gitLabForge.commit(
				{
					kind: "gitlab",
					origin: "https://gitlab.example.test",
					repository: "home/plugins/lamps",
					path: "",
					ref: null,
				},
				"missing",
				token,
			),
		).rejects.toThrow("no branch or tag named missing");
		const installed = await pluginManager
			.preview("https://gitlab.example.test/home/plugins/lamps")
			.catch((error: unknown) => error);
		expect(installed).toBeInstanceOf(Error);
		pluginSources.removeToken("gitlab.example.test");
		expect(pluginSources.tokenSites()).toEqual([]);
	});

	test("installs from a Forgejo on the local network, on its default branch", async () => {
		const row = await pluginManager.install("http://forge.lan:3000/me/lamps");
		expect(row.repository).toBe("gitea:http://forge.lan:3000/me/lamps");
		expect(row.ref).toBe(sha("2"));
		expect(row.status).toMatchObject({
			health: "unmaintained",
			url: "http://forge.lan:3000/me/lamps",
			latestVersion: "1.0.0",
		});
		expect(
			pluginManager.summaries().find((entry) => entry.id === "forgelamps"),
		).toMatchObject({
			site: "forge.lan:3000",
			url: "http://forge.lan:3000/me/lamps",
		});
		await expect(
			giteaForge.commit(
				{
					kind: "gitea",
					origin: "http://forge.lan:3000",
					repository: "me/lamps",
					path: "",
					ref: null,
				},
				"nope",
				null,
			),
		).rejects.toThrow("no branch or tag named nope");
		await expect(
			giteaForge.checkToken("http://forge.lan:3000", "x".repeat(20)),
		).rejects.toThrow("refused that token");
		await pluginManager.remove("forgelamps");
	});

	test("installs from a folder on this server and offers an update when its files change", async () => {
		const folder = join(root, "my-lamps");
		await mkdir(join(folder, "dist"), { recursive: true });
		await Bun.write(
			join(folder, "localassistant-plugin.json"),
			JSON.stringify(manifest("folderlamps")),
		);
		await Bun.write(join(folder, "dist/index.js"), code);
		await expect(
			pluginManager.preview(join(root, "nothing-here")),
		).rejects.toThrow("mount the folder into the container first");
		const row = await pluginManager.install(folder);
		expect(row.repository).toBe(`folder:${folder}`);
		expect(row.status).toMatchObject({ health: "local", url: null });
		expect(
			pluginManager.summaries().find((entry) => entry.id === "folderlamps"),
		).toMatchObject({ site: "this server", url: null, updateAvailable: false });
		await Bun.write(join(folder, "dist/index.js"), `${code}\n`);
		await pluginManager.check();
		expect(
			pluginManager.summaries().find((entry) => entry.id === "folderlamps")
				?.updateAvailable,
		).toBe(true);
		await pluginManager.update("folderlamps");
		expect(PluginDTO.find("folderlamps")?.ref).not.toBe(row.ref);
		await Bun.write(join(folder, "localassistant-plugin.json"), "{ broken");
		expect(
			await folderSource.commit({
				kind: "folder",
				origin: "",
				repository: folder,
				path: "",
				ref: null,
			}),
		).toMatch(/^[0-9a-f]{40}$/);
		expect(
			await folderSource.download(
				{ kind: "folder", origin: "", repository: folder, path: "", ref: null },
				"x",
				"../outside.txt",
			),
		).toBeNull();
		await expect(folderSource.checkToken()).rejects.toThrow("needs no token");
		expect(
			pluginSources.saveToken("http://forge.lan:3000", "x".repeat(20)),
		).rejects.toThrow("refused that token");
		await pluginManager.remove("folderlamps");
	});

	test("browses GitHub, GitLab and Codeberg together, skipping a site that fails", async () => {
		const listings = await pluginManager.browse();
		expect(
			listings.map((entry) => [entry.site, entry.repository, entry.stars]),
		).toEqual([
			["codeberg.org", "someone/cb-lamps", 9],
			["gitlab.com", "someone/gl-lamps", 5],
		]);
		expect(listings[0]).toMatchObject({
			name: "cb-lamps",
			health: "maintained",
			installed: false,
		});
	});

	test("explains limits and failures in plain words", async () => {
		const limited = new Response("{}", {
			status: 403,
			headers: { "x-ratelimit-remaining": "0" },
		});
		expect(() => forgeHttp.check(limited, "gitlab.com", null)).toThrow(
			"limiting requests",
		);
		expect(() =>
			forgeHttp.check(new Response("{}", { status: 500 }), "gitlab.com", null),
		).toThrow("gitlab.com answered 500.");
		await expect(
			forgeHttp.bytes(new Response("x", { status: 500 }), "a.js"),
		).rejects.toThrow("answered 500 for a.js");
		await expect(
			forgeHttp.checkToken(
				"https://gitlab.example.test/api/v4/nothing",
				{},
				"x",
			),
		).rejects.toThrow("x answered 404.");
		(
			globalThis.fetch as unknown as { mockRejectedValue(error: Error): void }
		).mockRejectedValue(new Error("offline"));
		await expect(
			forgeHttp.get("https://gitlab.com", {}, "gitlab.com"),
		).rejects.toThrow("gitlab.com can't be reached");
	});
});
