import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { PluginDTO } from "#lib/dto/plugin.js";
import { getPluginSettings, getSetting, setSetting } from "#lib/dto/setting.js";
import { configuration } from "#lib/server/core/config.js";
import { secrets } from "#lib/server/core/secrets.js";
import { deviceEvents } from "#lib/server/devices/device-events.js";
import { devices } from "#lib/server/devices/devices.js";
import { pluginContexts } from "#lib/server/plugins/context.js";
import { gitHub } from "#lib/server/plugins/github.js";
import { pluginManager } from "#lib/server/plugins/manager.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";
import {
	connectionSchema,
	gitHubTokenSchema,
	parseManifest,
} from "#lib/server/validation/plugins.js";

import { homeId, resetDatabase } from "../../database.js";

const repository = "someone/localassistant-demo";
const shaOf: Record<string, string> = {
	"v1.0.0": "a".repeat(40),
	"v1.1.0": "c".repeat(40),
	main: "b".repeat(40),
	"v-nothing": "e".repeat(40),
	"v-read": "f".repeat(40),
};

const manifest = (version: string, extra: Record<string, unknown> = {}) => ({
	id: "demo",
	name: "Demo lamps",
	description: "Lamps for the tests.",
	author: "Someone",
	version,
	icon: "lightbulb",
	connection: {
		description: "The demo account.",
		connected: "Lamps are read every two minutes.",
		find: "Find new lamps",
		fields: [{ name: "token", label: "Token", type: "secret" }],
	},
	device: {
		title: "Add a lamp",
		description: "A lamp on your network.",
		submit: "Add the lamp",
		fields: [
			{ name: "serial", label: "Serial", type: "text", pattern: "^L\\d+$" },
			{ name: "pin", label: "PIN", type: "secret", optional: true },
		],
	},
	kinds: [
		{
			id: "demo-lamp",
			label: "Demo lamp",
			card: "switch",
			icon: "lightbulb",
			polled: true,
		},
	],
	...extra,
});

const code = `export default {
	add(values) {
		if (values.serial === "L0") throw new Error("That lamp is broken.");
		return { kind: "demo-lamp", externalId: String(values.serial), host: null };
	},
	async connect(values) {
		if (values.token === "bad") throw new Error("The demo refused the token.");
	},
	async discover() {
		return [{ kind: "demo-lamp", externalId: "found-1", name: "Found" }];
	},
	async read(device) {
		return { type: "switch", on: device.secret("pin") === "1234", power: null, energy: null };
	},
	async command(device, command) {
		return { type: "switch", on: command.on, power: 5, energy: null };
	},
	start(context) {
		context.every(60000, () => {});
	},
	stop() {},
};
`;

interface Repo {
	release: string | null;
	manifests: Record<string, unknown>;
	code: string | null;
	archived: boolean;
	pushedAt: string;
}

let repo: Repo;
let limited = false;
let offline = false;
let root = "";
let originalPath = "";

function respond(body: unknown, status = 200): Response {
	return new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status,
	});
}

function fakeGitHub(input: string | URL | Request): Promise<Response> {
	if (offline) {
		return Promise.reject(new TypeError("offline"));
	}
	const url = String(input);
	if (limited) {
		return Promise.resolve(
			new Response("{}", {
				status: 403,
				headers: { "x-ratelimit-remaining": "0" },
			}),
		);
	}
	const api = "https://api.github.com";
	const raw = "https://raw.githubusercontent.com";
	if (url === `${api}/repos/${repository}`) {
		return Promise.resolve(
			respond({
				full_name: repository,
				description: "Demo",
				html_url: `https://github.com/${repository}`,
				stargazers_count: 3,
				archived: repo.archived,
				pushed_at: repo.pushedAt,
				default_branch: "main",
			}),
		);
	}
	if (url === `${api}/repos/${repository}/releases/latest`) {
		return Promise.resolve(
			repo.release
				? respond({ tag_name: repo.release, published_at: repo.pushedAt })
				: respond({}, 404),
		);
	}
	const commit = /\/repos\/[^/]+\/[^/]+\/commits\/(.+)$/.exec(url);
	if (commit?.[1]) {
		const sha = shaOf[decodeURIComponent(commit[1])];
		return Promise.resolve(sha ? respond(sha) : respond({}, 422));
	}
	if (url.startsWith(`${api}/search/repositories`)) {
		return Promise.resolve(
			respond({
				items: [
					{
						full_name: "orochibraru/localassistant",
						description: "This app",
						html_url: "https://github.com/orochibraru/localassistant",
						stargazers_count: 10,
						archived: false,
						pushed_at: repo.pushedAt,
						default_branch: "main",
					},
					{
						full_name: repository,
						description: null,
						html_url: `https://github.com/${repository}`,
						stargazers_count: 3,
						archived: false,
						pushed_at: null,
						default_branch: "main",
					},
				],
			}),
		);
	}
	const file = new RegExp(`^${raw}/${repository}/([0-9a-f]{40})/(.+)$`).exec(
		url,
	);
	if (file?.[1] && file[2] === "localassistant-plugin.json") {
		const body = repo.manifests[file[1]];
		return Promise.resolve(
			body === undefined
				? respond("", 404)
				: respond(typeof body === "string" ? body : JSON.stringify(body)),
		);
	}
	if (file?.[2] === "dist/index.js") {
		return Promise.resolve(
			repo.code === null ? respond("", 404) : respond(repo.code),
		);
	}
	return Promise.resolve(respond({}, 404));
}

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "localassistant-plugins-"));
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
	limited = false;
	offline = false;
	repo = {
		release: "v1.0.0",
		manifests: {
			[shaOf["v1.0.0"] as string]: manifest("1.0.0"),
			[shaOf["v1.1.0"] as string]: manifest("1.1.0"),
			[shaOf.main as string]: manifest("1.2.0-dev"),
		},
		code,
		archived: false,
		pushedAt: new Date().toISOString(),
	};
	spyOn(globalThis, "fetch").mockImplementation(fakeGitHub as typeof fetch);
});

describe("GitHub links", () => {
	test("read every way a person might paste one", () => {
		for (const link of [
			"someone/localassistant-demo",
			"github.com/someone/localassistant-demo",
			"https://github.com/someone/localassistant-demo/",
			"https://www.github.com/someone/localassistant-demo.git",
			"git@github.com:someone/localassistant-demo.git",
			"https://github.com/someone/localassistant-demo?tab=readme#top",
		]) {
			expect(gitHub.parseLink(link)).toEqual({
				repository,
				path: "",
				ref: null,
			});
		}
		expect(
			gitHub.parseLink(
				"https://github.com/someone/plugins/tree/main/lamps/../x/./localassistant-plugin.json",
			),
		).toEqual({ repository: "someone/plugins", path: "lamps/x", ref: "main" });
		for (const link of ["", "someone", "https://example.com/a/b", "a b/c"]) {
			expect(() => gitHub.parseLink(link)).toThrow("isn't a link");
		}
	});

	test("say how maintained a repository is", () => {
		const now = Date.parse("2026-10-29T00:00:00Z");
		const ago = (days: number) =>
			new Date(now - days * 24 * 60 * 60_000).toISOString();
		expect(gitHub.health({ archived: true, pushedAt: ago(1) }, now)).toBe(
			"archived",
		);
		expect(gitHub.health({ archived: false, pushedAt: null }, now)).toBe(
			"unknown",
		);
		expect(gitHub.health({ archived: false, pushedAt: ago(30) }, now)).toBe(
			"maintained",
		);
		expect(gitHub.health({ archived: false, pushedAt: ago(250) }, now)).toBe(
			"quiet",
		);
		expect(gitHub.health({ archived: false, pushedAt: ago(500) }, now)).toBe(
			"unmaintained",
		);
	});

	test("explain limits, outages, missing repositories and refs", async () => {
		await expect(gitHub.repository("someone/nothing")).rejects.toThrow(
			"no public repository",
		);
		await expect(gitHub.commit(repository, "nope")).rejects.toThrow(
			"no branch or tag named nope",
		);
		limited = true;
		await expect(gitHub.repository(repository)).rejects.toThrow(
			"limiting requests",
		);
		limited = false;
		offline = true;
		await expect(gitHub.search()).rejects.toThrow("can't be reached");
	});
});

describe("installing plugins", () => {
	test("previews, installs, runs and removes a plugin from GitHub", async () => {
		const preview = await pluginManager.preview(repository);
		expect(preview).toMatchObject({
			repository,
			ref: shaOf["v1.0.0"],
			url: `https://github.com/${repository}`,
			status: { health: "maintained", stars: 3, latestVersion: "v1.0.0" },
			compatible: true,
			installed: false,
			conflict: null,
		});
		await pluginManager.install(repository);
		expect(
			existsSync(
				join(
					plugins.codeFolder("demo", shaOf["v1.0.0"] as string),
					"dist/index.js",
				),
			),
		).toBe(true);
		expect(plugins.catalog()["demo-lamp"]).toMatchObject({
			plugin: "demo",
			card: "switch",
			icon: "lightbulb",
		});
		expect(JobDTO.isQueued("plugins.reload")).toBe(true);
		const summary = pluginManager
			.summaries()
			.find((entry) => entry.id === "demo");
		expect(summary).toMatchObject({
			official: false,
			enabled: true,
			updateAvailable: false,
			url: `https://github.com/${repository}`,
			kinds: ["Demo lamp"],
			devices: 0,
		});
		expect((await pluginManager.preview(repository)).installed).toBe(true);

		const demo = pluginSetup.plugin("demo");
		if (!demo) {
			throw new Error("Not loaded");
		}
		const lamp = await pluginSetup.addDevice(
			demo,
			{ homeId: homeId(), name: "Desk", roomId: null },
			{ serial: "L1", pin: "1234" },
		);
		expect(lamp.toJSON().fields).toEqual({ serial: "L1" });
		expect(JSON.stringify(lamp.toJSON())).not.toContain("1234");
		expect(secrets.decrypt(lamp.encryptedSecrets().pin ?? "")).toBe("1234");
		expect(JobDTO.isQueued("device.refresh")).toBe(true);
		await devices.refresh(lamp);
		expect(DeviceDTO.find(lamp.id)?.state).toMatchObject({ on: true });
		await pluginSetup.editDevice(
			demo,
			lamp,
			{ name: "Desk lamp", roomId: null },
			{ serial: "L2" },
		);
		expect(DeviceDTO.find(lamp.id)?.toJSON()).toMatchObject({
			name: "Desk lamp",
			externalId: "L2",
			state: null,
		});
		expect(
			pluginContexts.device(DeviceDTO.find(lamp.id) ?? lamp).secret("pin"),
		).toBe("1234");
		const other = await pluginSetup.addDevice(
			demo,
			{ homeId: homeId(), name: "Other", roomId: null },
			{ serial: "L5" },
		);
		await expect(
			pluginSetup.editDevice(
				demo,
				other,
				{ name: "Other", roomId: null },
				{ serial: "L2" },
			),
		).rejects.toThrow("already has the same id");
		await expect(
			pluginSetup.addDevice(
				demo,
				{ homeId: homeId(), name: "Broken", roomId: null },
				{ serial: "L0" },
			),
		).rejects.toThrow("That lamp is broken.");
		await devices.command(DeviceDTO.find(lamp.id) ?? lamp, {
			type: "switch",
			on: true,
		});
		expect(DeviceDTO.find(lamp.id)?.state).toMatchObject({
			on: true,
			power: 5,
		});

		await expect(
			pluginSetup.connect(demo, homeId(), { token: "bad" }),
		).rejects.toThrow("refused the token");
		expect(await pluginSetup.connect(demo, homeId(), { token: "good" })).toBe(
			1,
		);
		expect(getPluginSettings("demo")?.values).toEqual({});
		expect(
			secrets.decrypt(getPluginSettings("demo")?.secrets.token ?? ""),
		).toBe("good");
		expect(pluginContexts.settings("demo")).toEqual({ token: "good" });
		expect(
			pluginSetup.setups().find((setup) => setup.id === "demo"),
		).toMatchObject({ connected: true, secretsSet: ["token"] });
		expect(await pluginSetup.discover(demo)).toBe(0);
		expect(
			connectionSchema(demo.manifest.connection?.fields ?? [], true).parse({
				plugin: "demo",
				"value:token": "",
			}),
		).toEqual({ plugin: "demo", values: {} });

		pluginManager.setEnabled("demo", false);
		expect(plugins.enabled("demo")).toBe(false);
		expect(pluginSetup.plugin("demo")).toBeUndefined();
		await devices.refresh(DeviceDTO.find(lamp.id) ?? lamp);
		expect(DeviceDTO.find(lamp.id)?.toJSON().stateError).toBe(
			"Its integration is turned off.",
		);
		await expect(
			devices.command(DeviceDTO.find(lamp.id) ?? lamp, {
				type: "switch",
				on: false,
			}),
		).rejects.toThrow("turned off");
		pluginManager.setEnabled("demo", true);
		expect(getSetting("disabledPlugins")).toEqual([]);

		expect(pluginSetup.disconnect(demo)).toBe(3);
		expect(getPluginSettings("demo")).toBeNull();
		const kept = await pluginSetup.addDevice(
			demo,
			{ homeId: homeId(), name: "Desk", roomId: null },
			{ serial: "L3" },
		);
		expect(await pluginManager.remove("demo")).toBe(1);
		expect(DeviceDTO.find(kept.id)).toBeUndefined();
		expect(plugins.get("demo")).toBeUndefined();
		expect(existsSync(plugins.codeFolder("demo", "x"))).toBe(false);
		expect(await pluginManager.remove("demo")).toBe(0);
		await devices.refresh(
			DeviceDTO.upsert({
				kind: "demo-lamp",
				homeId: homeId(),
				name: "Orphan",
				externalId: "o",
			}),
		);
		expect(DeviceDTO.all()[0]?.toJSON().stateError).toBe(
			"Its integration isn't installed anymore.",
		);
	});

	test("finds updates, installs them, and follows the default branch without releases", async () => {
		await pluginManager.install(repository);
		expect(await pluginManager.check()).toBe(1);
		repo.release = "v1.1.0";
		await pluginManager.check();
		expect(
			pluginManager.summaries().find((entry) => entry.id === "demo"),
		).toMatchObject({
			updateAvailable: true,
			status: { latestVersion: "v1.1.0", latestRef: shaOf["v1.1.0"] },
		});
		await pluginManager.update("demo");
		expect(PluginDTO.find("demo")?.ref).toBe(shaOf["v1.1.0"]);
		expect(plugins.get("demo")?.manifest.version).toBe("1.1.0");
		repo.release = null;
		expect((await pluginManager.preview(repository)).ref).toBe(
			shaOf.main as string,
		);
		offline = true;
		await pluginManager.check();
		expect(PluginDTO.find("demo")?.status?.checkedAt).toBeString();
		offline = false;
		repo.manifests[shaOf.main as string] = manifest("2.0.0", {
			id: "other",
			kinds: [{ id: "other", label: "Other", card: "switch", icon: "plug" }],
		});
		await expect(pluginManager.update("demo")).rejects.toThrow(
			"calls itself other, not demo",
		);
		await expect(pluginManager.update("tuya")).rejects.toThrow(
			"isn't installed from GitHub",
		);
		expect(
			(await pluginManager.browse()).map((entry) => [
				entry.repository,
				entry.installed,
				entry.health,
			]),
		).toEqual([[repository, true, "unknown"]]);
		await pluginManager.remove("demo");
	});

	test("refuses what isn't a plugin, clashes, needs a newer app or doesn't load", async () => {
		const sha = shaOf["v1.0.0"] as string;
		repo.manifests[sha] = undefined as unknown as string;
		delete repo.manifests[sha];
		await expect(pluginManager.preview(repository)).rejects.toThrow(
			"isn't a LocalAssistant integration",
		);
		repo.manifests[sha] = "{ nope";
		await expect(pluginManager.preview(repository)).rejects.toThrow(
			"isn't valid JSON",
		);
		repo.manifests[sha] = { ...manifest("1.0.0"), kinds: [] };
		await expect(pluginManager.preview(repository)).rejects.toThrow(
			"localassistant-plugin.json is invalid at kinds",
		);
		repo.manifests[sha] = manifest("1.0.0", {
			id: "tuya",
			kinds: [{ id: "tuya-lamp", label: "Lamp", card: "switch", icon: "plug" }],
		});
		expect((await pluginManager.preview(repository)).conflict).toContain(
			"already uses the id tuya",
		);
		await expect(pluginManager.install(repository)).rejects.toThrow(
			"already uses the id tuya",
		);
		repo.manifests[sha] = manifest("1.0.0", {
			kinds: [{ id: "demo", label: "Blind", card: "cover", icon: "blinds" }],
		});
		expect(
			plugins.conflict(parseManifest(repo.manifests[sha]), repository),
		).toBeNull();
		repo.manifests[sha] = manifest("1.0.0", { localassistant: "99.0.0" });
		await expect(pluginManager.install(repository)).rejects.toThrow(
			"needs LocalAssistant 99.0.0 or newer",
		);
		repo.manifests[sha] = manifest("1.0.0");
		repo.code = null;
		await expect(pluginManager.install(repository)).rejects.toThrow(
			"has no dist/index.js",
		);
		repo.code = "export const nothing = 1;";
		repo.release = "v-nothing";
		repo.manifests[shaOf["v-nothing"] as string] = manifest("1.0.0");
		await expect(pluginManager.install(repository)).rejects.toThrow(
			"doesn't export a plugin as default",
		);
		expect(PluginDTO.find("demo")).toBeUndefined();
		repo.code = "export default { read: 4 };";
		repo.release = "v-read";
		repo.manifests[shaOf["v-read"] as string] = manifest("1.0.0");
		await expect(pluginManager.install(repository)).rejects.toThrow(
			"Its read isn't a function.",
		);
	});
});

describe("the registry", () => {
	test("loads what the server installed, records what fails, and starts and stops plugins", async () => {
		await pluginManager.install(repository);
		await plugins.unload("demo");
		expect(plugins.get("demo")).toBeUndefined();
		await plugins.loadInstalled();
		expect(plugins.get("demo")?.ref).toBe(shaOf["v1.0.0"]);
		await plugins.startAll();
		await plugins.start("demo");
		await plugins.restart("demo");
		await plugins.stopAll();
		const row = PluginDTO.find("demo");
		PluginDTO.save({
			id: "demo",
			repository,
			path: "",
			ref: "d".repeat(40),
			manifest: row?.manifest ?? parseManifest(manifest("1.0.0")),
			status: row?.status ?? {
				health: "unknown",
				stars: null,
				pushedAt: null,
				latestVersion: null,
				latestRef: null,
				checkedAt: null,
			},
		});
		await plugins.loadInstalled();
		expect(plugins.failure("demo")).toBeString();
		expect(
			pluginManager.summaries().find((entry) => entry.id === "demo")?.loadError,
		).toBeString();
		PluginDTO.find("demo")?.delete();
		await plugins.loadInstalled();
		expect(plugins.failure("demo")).toBeNull();
	});

	test("compares versions with the running app", () => {
		const base = parseManifest(manifest("1.0.0"));
		const app = configuration.get().appVersion;
		configuration.get().appVersion = "1.4.2";
		expect(plugins.compatible({ ...base, localassistant: "1.4.2" })).toBe(true);
		expect(plugins.compatible({ ...base, localassistant: "1.3.9" })).toBe(true);
		expect(plugins.compatible({ ...base, localassistant: "1.5.0" })).toBe(
			false,
		);
		expect(plugins.compatible(base)).toBe(true);
		configuration.get().appVersion = "dev";
		expect(plugins.compatible({ ...base, localassistant: "9.0.0" })).toBe(true);
		configuration.get().appVersion = app;
	});

	test("contexts keep plugins to their own devices and folders, and contact listeners can fail", async () => {
		const context = plugins.get("linky")?.context;
		const tuya = DeviceDTO.upsert({
			kind: "tuya-cover",
			homeId: homeId(),
			name: "Blind",
			externalId: "b",
		});
		expect(context?.device(tuya.id)).toBeUndefined();
		expect(() =>
			context?.saveState(pluginContexts.device(tuya), {
				type: "linky",
				day: null,
				kilowattHours: null,
			}),
		).toThrow("isn't one of this plugin's");
		expect(context?.folder("a/b")).toEndWith(
			join("plugin-data", "linky", "a_b"),
		);
		const contact = DeviceDTO.upsert({
			kind: "zigbee-contact",
			homeId: homeId(),
			name: "Door",
			externalId: "door",
		});
		contact.saveState({ type: "contact", open: false, battery: null });
		deviceEvents.onContact(() => {
			throw new Error("listener broke");
		});
		deviceEvents.save(contact, { type: "contact", open: true, battery: null });
		await Bun.sleep(1);
		expect(DeviceDTO.find(contact.id)?.state).toMatchObject({ open: true });
		plugins.get("linky")?.context.notify({
			title: "Hi",
			body: "There",
			audience: "admins",
		});
		expect(JobDTO.isQueued("push.send")).toBe(true);
	});
});

describe("private integrations", () => {
	const privateRepository = "someone/private-lamps";
	const sha = "d".repeat(40);
	const token = `github_pat_${"x".repeat(30)}`;

	function fakePrivateGitHub(
		input: string | URL | Request,
		init?: RequestInit,
	) {
		const url = String(input);
		const authorized =
			new Headers(init?.headers).get("authorization") === `Bearer ${token}`;
		const api = `https://api.github.com/repos/${privateRepository}`;
		if (url === "https://api.github.com/user") {
			return Promise.resolve(
				authorized
					? Response.json({ login: "someone" })
					: new Response("{}", { status: 401 }),
			);
		}
		if (new Headers(init?.headers).has("authorization") && !authorized) {
			return Promise.resolve(new Response("{}", { status: 401 }));
		}
		if (!url.startsWith(api) || !authorized) {
			return Promise.resolve(new Response("{}", { status: 404 }));
		}
		if (url === api) {
			return Promise.resolve(
				Response.json({
					full_name: privateRepository,
					description: "Private lamps",
					html_url: `https://github.com/${privateRepository}`,
					stargazers_count: 0,
					archived: false,
					pushed_at: new Date().toISOString(),
					default_branch: "main",
				}),
			);
		}
		if (url === `${api}/releases/latest`) {
			return Promise.resolve(new Response("{}", { status: 404 }));
		}
		if (url === `${api}/commits/main`) {
			return Promise.resolve(new Response(sha));
		}
		const accept = new Headers(init?.headers).get("accept");
		if (
			url === `${api}/contents/localassistant-plugin.json?ref=${sha}` &&
			accept === "application/vnd.github.raw"
		) {
			return Promise.resolve(
				Response.json(
					manifest("1.0.0", {
						id: "private",
						kinds: [
							{
								id: "private-lamp",
								label: "Lamp",
								card: "switch",
								icon: "lightbulb",
							},
						],
					}),
				),
			);
		}
		if (url === `${api}/contents/dist/index.js?ref=${sha}`) {
			return Promise.resolve(new Response(code));
		}
		return Promise.resolve(new Response("{}", { status: 404 }));
	}

	test("a saved token reaches a private repository, and without it the link explains why it fails", async () => {
		spyOn(globalThis, "fetch").mockImplementation(
			fakePrivateGitHub as typeof fetch,
		);
		await expect(pluginManager.preview(privateRepository)).rejects.toThrow(
			"for a private one, save a GitHub token first",
		);
		await expect(gitHub.checkToken("github_pat_wrong")).rejects.toThrow(
			"GitHub refused that token",
		);
		await gitHub.checkToken(token);
		setSetting("githubToken", { encryptedToken: secrets.encrypt(token) });
		const preview = await pluginManager.preview(privateRepository);
		expect(preview).toMatchObject({ ref: sha, manifest: { id: "private" } });
		await pluginManager.install(privateRepository);
		expect(plugins.get("private")?.ref).toBe(sha);
		await expect(pluginManager.preview("someone/elsewhere")).rejects.toThrow(
			"no repository at that link the token can read",
		);
		await pluginManager.remove("private");
		setSetting("githubToken", {
			encryptedToken: secrets.encrypt("github_pat_revoked"),
		});
		await expect(pluginManager.preview(privateRepository)).rejects.toThrow(
			"GitHub refused the saved token",
		);
		setSetting("githubToken", null);
	});

	test("the token form wants something shaped like a GitHub token", () => {
		expect(gitHubTokenSchema.safeParse({ token }).success).toBe(true);
		expect(
			gitHubTokenSchema.safeParse({ token: `ghp_${"a".repeat(36)}` }).success,
		).toBe(true);
		expect(gitHubTokenSchema.safeParse({ token: "hunter2" }).success).toBe(
			false,
		);
	});
});
