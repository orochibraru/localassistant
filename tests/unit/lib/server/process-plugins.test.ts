import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from "bun:test";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { JobDTO } from "#lib/dto/job.js";
import { PluginDTO } from "#lib/dto/plugin.js";
import { configuration } from "#lib/server/core/config.js";
import { broker } from "#lib/server/devices/broker.js";
import { devices } from "#lib/server/devices/devices.js";
import { pluginContexts } from "#lib/server/plugins/context.js";
import { processPlugins } from "#lib/server/plugins/process.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";
import { parseManifest } from "#lib/server/validation/plugins.js";

import { homeId, resetDatabase } from "../../database.js";

const sdk = join(process.cwd(), "sdk/python/localassistant_plugin.py");
let root = "";
let originalPath = "";

const fixtureManifest = parseManifest({
	id: "fixture",
	name: "Fixture lamps",
	description: "Lamps for the process tests.",
	version: "1.0.0",
	runtime: "process",
	interpreter: "python3",
	entry: "plugin.py",
	files: ["localassistant_plugin.py"],
	icon: "lightbulb",
	connection: {
		description: "The fixture account.",
		connected: "Connected.",
		find: "Find lamps",
		fields: [{ name: "token", label: "Token", type: "secret" }],
	},
	device: {
		title: "Add a lamp",
		description: "A lamp.",
		submit: "Add",
		fields: [
			{ name: "serial", label: "Serial", type: "text" },
			{ name: "pin", label: "PIN", type: "secret", optional: true },
		],
	},
	kinds: [
		{
			id: "fixture-lamp",
			label: "Fixture lamp",
			card: "switch",
			icon: "lightbulb",
			polled: true,
		},
	],
});

async function install(
	manifest: ReturnType<typeof parseManifest>,
	script: string,
	ref: string,
) {
	const folder = plugins.codeFolder(manifest.id, ref);
	await mkdir(folder, { recursive: true });
	await copyFile(script, join(folder, "plugin.py"));
	await copyFile(sdk, join(folder, "localassistant_plugin.py"));
	const row = PluginDTO.save({
		id: manifest.id,
		repository: "github:https://github.com/someone/fixture",
		path: "",
		ref,
		manifest,
		status: {
			health: "maintained",
			url: null,
			stars: 0,
			pushedAt: null,
			latestVersion: null,
			latestRef: ref,
			checkedAt: null,
		},
	});
	await plugins.load(row);
	const hosted = plugins.get(manifest.id);
	if (!hosted) {
		throw new Error(plugins.failure(manifest.id) ?? "Not loaded");
	}
	return hosted;
}

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "localassistant-process-"));
	originalPath = configuration.get().databasePath;
	configuration.get().databasePath = join(root, "localassistant.sqlite");
});

afterAll(async () => {
	await plugins.unload("fixture");
	await plugins.unload("tasmota-python");
	configuration.get().databasePath = originalPath;
	await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
	resetDatabase();
});

describe("process plugins", () => {
	test("a Python plugin runs every hook and every host call through the SDK", async () => {
		const hosted = await install(
			fixtureManifest,
			join(process.cwd(), "tests/unit/fixtures/process_plugin.py"),
			"1".repeat(40),
		);
		expect(Object.keys(hosted.plugin).toSorted()).toEqual([
			"add",
			"clips",
			"command",
			"connect",
			"discover",
			"read",
			"serve",
			"start",
			"stop",
		]);
		await expect(
			pluginSetup.connect(hosted, homeId(), { token: "bad" }),
		).rejects.toThrow("The fixture refused the token.");
		expect(await pluginSetup.connect(hosted, homeId(), { token: "1234" })).toBe(
			1,
		);
		const lamp = await pluginSetup.addDevice(
			hosted,
			{ homeId: homeId(), name: "Desk", roomId: null },
			{ serial: "L1", pin: "1234" },
		);
		await devices.refresh(lamp);
		expect(DeviceDTO.find(lamp.id)?.state).toEqual({
			type: "switch",
			on: true,
			power: 2,
			energy: 1,
		});
		expect(EnergyReadingDTO.since([lamp.id], new Date(0))).toHaveLength(1);
		expect(JobDTO.isQueued("push.send")).toBe(true);
		await devices.command(DeviceDTO.find(lamp.id) ?? lamp, {
			type: "switch",
			on: false,
		});
		expect(DeviceDTO.find(lamp.id)?.state).toMatchObject({ on: false });
		const served = await hosted.plugin.serve?.(
			pluginContexts.device(lamp),
			"a/b.txt",
			new Request("http://localhost/"),
			hosted.context,
		);
		expect(served?.status).toBe(201);
		expect(await served?.text()).toBe("a/b.txt");
		expect(
			await hosted.plugin.clips?.(pluginContexts.device(lamp), hosted.context),
		).toEqual({ title: "Events", empty: "None yet.", clips: [] });

		const subscribe = spyOn(broker, "subscribe");
		const publish = spyOn(broker, "publish").mockResolvedValue();
		await plugins.start("fixture");
		expect(subscribe).toHaveBeenCalledWith(
			"fixture",
			"fixture/+",
			expect.any(Function),
		);
		broker.dispatch("fixture/desk", Buffer.from("on"));
		for (
			let attempt = 0;
			attempt < 100 && publish.mock.calls.length === 0;
			attempt++
		) {
			await Bun.sleep(10);
		}
		expect(publish).toHaveBeenCalledWith("echo/desk", "on");
		subscribe.mockRestore();
		publish.mockRestore();

		const crash = await pluginSetup.addDevice(
			hosted,
			{ homeId: homeId(), name: "Crash", roomId: null },
			{ serial: "crash" },
		);
		await devices.refresh(crash);
		expect(DeviceDTO.find(crash.id)?.toJSON().stateError).toContain(
			"The plugin stopped",
		);
		await devices.refresh(DeviceDTO.find(lamp.id) ?? lamp);
		expect(DeviceDTO.find(lamp.id)?.toJSON().stateError).toBeNull();
		await plugins.stop("fixture");
		await plugins.unload("fixture");
		await expect(
			hosted.plugin.read?.(pluginContexts.device(lamp), hosted.context),
		).resolves.toMatchObject({ type: "switch" });
		processPlugins.kill("fixture");
	});

	test("a process that never answers doesn't load, and the command runs its interpreter", async () => {
		expect(
			processPlugins.command(fixtureManifest, "plugin.py", "/plugins/fixture"),
		).toEqual(["python3", "/plugins/fixture/plugin.py"]);
		expect(
			processPlugins.command(
				{ ...fixtureManifest, interpreter: undefined },
				"dist/linux-x64",
				"/plugins/fixture",
			),
		).toEqual(["/plugins/fixture/dist/linux-x64"]);
		expect(() =>
			plugins.entryFor({ ...fixtureManifest, entry: { "darwin-x64": "x" } }),
		).toThrow("has no build for this server");
		const folder = join(root, "broken");
		await mkdir(folder, { recursive: true });
		await Bun.write(join(folder, "plugin.py"), "import sys\nsys.exit(4)\n");
		await expect(
			processPlugins.create(
				fixtureManifest,
				"plugin.py",
				folder,
				plugins.get("linky")?.context ?? pluginContexts.create(fixtureManifest),
			),
		).rejects.toThrow("The plugin stopped (exit code 4).");
	});

	test("the Python example drives a Tasmota plug", async () => {
		let power = "OFF";
		const plug = Bun.serve({
			port: 0,
			fetch(request) {
				const command = new URL(request.url).searchParams.get("cmnd");
				if (command === "Power On") {
					power = "ON";
				}
				if (command === "Power Off") {
					power = "OFF";
				}
				return Response.json({ POWER: power });
			},
		});
		const manifest = parseManifest(
			await Bun.file("sdk/python/example/localassistant-plugin.json").json(),
		);
		const hosted = await install(
			manifest,
			join(process.cwd(), "sdk/python/example/plugin.py"),
			"2".repeat(40),
		);
		const device = await pluginSetup.addDevice(
			hosted,
			{ homeId: homeId(), name: "Kettle", roomId: null },
			{ host: `127.0.0.1:${plug.port}` },
		);
		await devices.refresh(device);
		expect(DeviceDTO.find(device.id)?.state).toMatchObject({ on: false });
		await devices.command(DeviceDTO.find(device.id) ?? device, {
			type: "switch",
			on: true,
		});
		expect(power).toBe("ON");
		expect(DeviceDTO.find(device.id)?.state).toMatchObject({ on: true });
		await plugins.unload("tasmota-python");
		await plug.stop(true);
	});
});
