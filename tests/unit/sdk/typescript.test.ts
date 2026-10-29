import { describe, expect, test } from "bun:test";

import type * as App from "#lib/devices.js";
import type * as AppSdk from "#lib/plugin-sdk.js";
import { definePlugin as appDefine } from "#lib/plugin-sdk.js";
import type * as AppPlugins from "#lib/plugins.js";
import {
	pluginCards as appCards,
	pluginIcons as appIcons,
	pluginPlatforms as appPlatforms,
} from "#lib/plugins.js";
import { parseManifest } from "#lib/server/validation/plugins.js";

import example from "../../../sdk/typescript/example/src/index.js";
import * as Sdk from "../../../sdk/typescript/localassistant-plugin.js";

type Same<First, Second> = [First] extends [Second]
	? [Second] extends [First]
		? true
		: false
	: false;

const sameTypes: [
	Same<Sdk.DeviceState, App.DeviceState>,
	Same<Sdk.ClimateChange, App.ClimateChange>,
	Same<Sdk.PrinterChange, App.PrinterChange>,
	Same<Sdk.VacuumChange, App.VacuumChange>,
	Same<Sdk.CoverMove, App.CoverMove>,
	Same<Sdk.PluginManifest, AppPlugins.PluginManifest>,
	Same<Sdk.PluginField, AppPlugins.PluginField>,
	Same<Sdk.PluginValues, AppPlugins.PluginValues>,
	Same<Sdk.Plugin, AppSdk.Plugin>,
	Same<Sdk.PluginContext, AppSdk.PluginContext>,
	Same<Sdk.PluginDevice, AppSdk.PluginDevice>,
	Same<Sdk.FoundDevice, AppSdk.FoundDevice>,
	Same<Sdk.DeviceCommand, AppSdk.DeviceCommand>,
	Same<Sdk.CameraClips, AppSdk.CameraClips>,
] = [
	true,
	true,
	true,
	true,
	true,
	true,
	true,
	true,
	true,
	true,
	true,
	true,
	true,
	true,
];

describe("the TypeScript SDK", () => {
	test("matches the types the app runs plugins with", () => {
		expect(sameTypes.every(Boolean)).toBe(true);
		expect(Sdk.pluginCards).toEqual(appCards);
		expect(Sdk.pluginIcons).toEqual(appIcons);
		expect(Sdk.pluginPlatforms).toEqual(appPlatforms);
	});

	test("definePlugin hands the plugin back as it is", () => {
		const plugin = {
			read: () =>
				Promise.resolve({ type: "meter" as const, power: 1, energy: null }),
		};
		expect(Sdk.definePlugin(plugin)).toBe(plugin);
		expect(appDefine(plugin)).toBe(plugin);
	});
});

describe("the SDK examples", () => {
	test("each language's example has a manifest LocalAssistant accepts", async () => {
		const runtimes = await Promise.all(
			["typescript", "go", "python"].map(async (language) => {
				const manifest = parseManifest(
					await Bun.file(
						`sdk/${language}/example/localassistant-plugin.json`,
					).json(),
				);
				return [manifest.runtime, manifest.interpreter ?? null];
			}),
		);
		expect(runtimes).toEqual([
			["bun", null],
			["process", null],
			["process", "python3"],
		]);
	});

	test("the TypeScript example turns a Tasmota plug on and off", async () => {
		let power = "OFF";
		const plug = Bun.serve({
			port: 0,
			fetch(request) {
				if (new URL(request.url).searchParams.get("cmnd") === "Power On") {
					power = "ON";
				}
				return Response.json({ POWER: power });
			},
		});
		const device = {
			id: "d1",
			kind: "tasmota-ts-plug",
			name: "Kettle",
			externalId: "x",
			host: `127.0.0.1:${plug.port}`,
			homeId: null,
			roomId: null,
			fields: {},
			state: null,
			stateAt: null,
			secret: () => null,
		};
		const context = {} as Sdk.PluginContext;
		expect(example.add?.({ host: "192.0.2.9" }, context)).toEqual({
			kind: "tasmota-ts-plug",
			externalId: "192.0.2.9",
			host: "192.0.2.9",
		});
		expect(await example.read?.(device, context)).toMatchObject({ on: false });
		expect(
			await example.command?.(device, { type: "switch", on: true }, context),
		).toMatchObject({ on: true });
		await expect(
			example.command?.(device, { type: "valve", target: 20 }, context),
		).rejects.toThrow("only turns on and off");
		await expect(
			example.read?.({ ...device, host: null }, context),
		).rejects.toThrow("no address");
		await plug.stop(true);
		await expect(example.read?.(device, context)).rejects.toThrow(
			"can't be reached",
		);
	});
});
