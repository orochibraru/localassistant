import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

import type Anthropic from "@anthropic-ai/sdk";

import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { setSetting } from "#lib/dto/setting.js";
import { assistant } from "#lib/server/assistant/assistant.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";
import { mcpEndpoint } from "#lib/server/mcp/server.js";
import {
	aiVisibilitySchema,
	assistantKeySchema,
	assistantTurnsSchema,
} from "#lib/server/validation/assistant.js";

import { homeId, resetDatabase } from "../../database.js";

type Reply = Partial<Anthropic.Beta.BetaMessage>;

function fakeClient(replies: Reply[]) {
	const requests: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
	const client = {
		beta: {
			messages: {
				create: (request: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
					requests.push(structuredClone(request));
					return Promise.resolve(replies.shift());
				},
			},
		},
	} as unknown as Anthropic;
	return { client, requests };
}

function lamp() {
	return DeviceDTO.upsert({
		kind: "mqtt-discovery-light",
		homeId: homeId(),
		name: "Lamp",
		externalId: "lamp",
	});
}

describe("the assistant", () => {
	beforeEach(resetDatabase);
	afterEach(() => {
		mock.restore();
	});

	test("is off until an admin saves a key", () => {
		expect(assistant.configured()).toBe(false);
		expect(() => assistant.client()).toThrow("Claude API key");
		setSetting("assistant", { encryptedApiKey: secrets.encrypt("sk-ant-x") });
		expect(assistant.configured()).toBe(true);
		expect(assistant.client()).toBeDefined();
	});

	test("reads the house, drives a device and answers in words", async () => {
		const device = lamp();
		const command = spyOn(devices, "command").mockResolvedValue();
		const { client, requests } = fakeClient([
			{
				stop_reason: "tool_use",
				content: [
					{ type: "tool_use", id: "a", name: "get_house", input: {} },
				] as Anthropic.Beta.BetaContentBlock[],
			},
			{
				stop_reason: "tool_use",
				content: [
					{
						type: "tool_use",
						id: "b",
						name: "control_device",
						input: {
							deviceId: device.id,
							command: { type: "light", change: { on: true } },
						},
					},
					{ type: "tool_use", id: "c", name: "nothing", input: {} },
				] as Anthropic.Beta.BetaContentBlock[],
			},
			{
				stop_reason: "end_turn",
				content: [
					{ type: "text", text: "The lamp is on." },
				] as Anthropic.Beta.BetaContentBlock[],
			},
		]);
		spyOn(assistant, "client").mockReturnValue(client);
		const reply = await assistant.reply(HomeDTO.first(), [
			{ role: "user", text: "Turn the lamp on" },
		]);
		expect(reply).toEqual({
			text: "The lamp is on.",
			actions: ["Turn Lamp on"],
		});
		expect(command).toHaveBeenCalledWith(expect.anything(), {
			type: "light",
			change: { on: true },
		});
		expect(requests[0]).toMatchObject({
			model: "claude-opus-5-5",
			fallbacks: "default",
			output_config: { effort: "low" },
		});
		expect(
			requests[0]?.tools?.map((tool) => (tool as { name: string }).name),
		).toEqual(["get_house", "control_device", "set_scene"]);
		const results = requests[2]?.messages.at(-1)?.content as {
			tool_use_id: string;
			is_error?: boolean;
		}[];
		expect(
			results.map((result) => [result.tool_use_id, result.is_error]),
		).toEqual([
			["b", undefined],
			["c", true],
		]);
		command.mockRestore();
	});

	test("says so on a refusal and stops after too many steps", async () => {
		const refusing = fakeClient([
			{ stop_reason: "refusal", content: [] },
		]).client;
		spyOn(assistant, "client").mockReturnValue(refusing);
		expect(
			(await assistant.reply(HomeDTO.first(), [{ role: "user", text: "x" }]))
				.text,
		).toBe("I can't help with that one.");
		const looping = fakeClient(
			Array.from({ length: 8 }, () => ({
				stop_reason: "tool_use" as const,
				content: [
					{ type: "tool_use", id: "a", name: "get_house", input: {} },
				] as Anthropic.Beta.BetaContentBlock[],
			})),
		).client;
		spyOn(assistant, "client").mockReturnValue(looping);
		expect(
			(await assistant.reply(HomeDTO.first(), [{ role: "user", text: "x" }]))
				.text,
		).toContain("too many steps");
		const silent = fakeClient([
			{ stop_reason: "end_turn", content: [] },
		]).client;
		spyOn(assistant, "client").mockReturnValue(silent);
		expect(
			(await assistant.reply(HomeDTO.first(), [{ role: "user", text: "x" }]))
				.text,
		).toBe("Done.");
	});

	test("its tools refuse hidden devices, bad commands and gone scenes", async () => {
		const home = HomeDTO.first();
		const device = lamp();
		const command = spyOn(devices, "command").mockRejectedValue(
			new Error("It's offline."),
		);
		const house = JSON.parse(
			(await assistant.run(home, "get_house", {})).content,
		) as { devices: { id: string }[]; scenes: unknown[] };
		expect(house.devices.map((entry) => entry.id)).toEqual([device.id]);
		expect(
			await assistant.run(home, "control_device", {
				deviceId: device.id,
				command: { type: "switch", on: true },
			}),
		).toEqual({ content: "It's offline.", error: true });
		expect(
			await assistant.run(home, "control_device", { deviceId: device.id }),
		).toMatchObject({ error: true });
		setSetting("aiHiddenDevices", [device.id]);
		expect(mcpEndpoint.visible(device)).toBe(false);
		expect(mcpEndpoint.house(home).devices).toEqual([]);
		expect(
			await assistant.run(home, "control_device", {
				deviceId: device.id,
				command: { type: "switch", on: true },
			}),
		).toEqual({ content: "No device has that id.", error: true });
		expect(await assistant.run(home, "set_scene", { sceneId: "gone" })).toEqual(
			{
				content: "No scene has that id.",
				error: true,
			},
		);
		const scene = SceneDTO.create(home.id, {
			name: "Night",
			members: [
				{ deviceId: device.id, command: { type: "switch", on: false } },
			],
		});
		expect(
			await assistant.run(home, "set_scene", { sceneId: scene.id }),
		).toEqual({
			content: "Lamp: It's offline.",
			error: true,
		});
		command.mockResolvedValue();
		expect(
			await assistant.run(home, "set_scene", { sceneId: scene.id }),
		).toEqual({
			content: "Done.",
			action: "Set Night",
		});
		command.mockRestore();
	});

	test("its forms check turns, keys and visibility", () => {
		expect(
			assistantTurnsSchema.safeParse({
				turns: [
					{ role: "user", text: "Hi" },
					{ role: "assistant", text: "Hello" },
					{ role: "user", text: "Lamp on" },
				],
			}).success,
		).toBe(true);
		expect(
			assistantTurnsSchema.safeParse({
				turns: [{ role: "assistant", text: "Hello" }],
			}).success,
		).toBe(false);
		expect(
			assistantKeySchema.safeParse({
				apiKey: "sk-ant-api03-abcdefghijklmnopqrstuv",
			}).success,
		).toBe(true);
		expect(assistantKeySchema.safeParse({ apiKey: "nope" }).success).toBe(
			false,
		);
		expect(aiVisibilitySchema.parse({ deviceId: "d" }).visible).toBe(false);
	});
});
