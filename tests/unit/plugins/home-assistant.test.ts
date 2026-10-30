import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import type { ServerWebSocket } from "bun";

import type { DeviceState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { devices } from "#lib/server/devices/devices.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";
import { haClient } from "#plugins/home-assistant/client.js";
import { haMapping } from "#plugins/home-assistant/mapping.js";

import { homeId, resetDatabase } from "../database.js";
import { hosted, pluginOf, seen } from "./support.js";

const plugin = pluginOf<{
	flush(context: unknown): void;
	keepConnected(context: unknown): Promise<void>;
}>("home-assistant");
const context = hosted("home-assistant").context;

const states = [
	{
		entity_id: "light.desk",
		state: "on",
		attributes: { friendly_name: "Desk lamp" },
	},
	{
		entity_id: "cover.living",
		state: "open",
		attributes: { friendly_name: "Living blind", current_position: 60 },
	},
	{
		entity_id: "climate.office",
		state: "heat",
		attributes: {
			friendly_name: "Office",
			hvac_modes: ["off", "heat", "heat_cool", "fan_only"],
			temperature: 21,
			current_temperature: 19.5,
			min_temp: 10,
			max_temp: 30,
		},
	},
	{
		entity_id: "binary_sensor.front",
		state: "off",
		attributes: { friendly_name: "Front door", device_class: "door" },
	},
	{
		entity_id: "sensor.grid_power",
		state: "1.2",
		attributes: { device_class: "power", unit_of_measurement: "kW" },
	},
	{
		entity_id: "sensor.grid_energy",
		state: "2500",
		attributes: { device_class: "energy", unit_of_measurement: "Wh" },
	},
	{
		entity_id: "camera.porch",
		state: "idle",
		attributes: { friendly_name: "Porch" },
	},
	{
		entity_id: "sensor.temperature",
		state: "20",
		attributes: { device_class: "temperature" },
	},
];

const calls: {
	domain: string;
	service: string;
	data: unknown;
	entity: unknown;
}[] = [];
const sockets = new Set<ServerWebSocket<unknown>>();
let refuseService = false;
const proxyTokens: (string | null)[] = [];

const server = Bun.serve({
	port: 0,
	fetch(request, self) {
		const url = new URL(request.url);
		proxyTokens.push(request.headers.get("x-proxy-token"));
		if (url.pathname === "/api/websocket" && self.upgrade(request)) {
			return undefined;
		}
		if (request.headers.get("authorization") !== "Bearer good-token") {
			return new Response("no", { status: 401 });
		}
		if (url.pathname === "/api/camera_proxy/camera.porch") {
			return new Response("jpeg", {
				headers: { "content-type": "image/jpeg" },
			});
		}
		return new Response("missing", { status: 404 });
	},
	websocket: {
		open(socket) {
			sockets.add(socket);
			socket.send(JSON.stringify({ type: "auth_required" }));
		},
		close(socket) {
			sockets.delete(socket);
		},
		message(socket, raw) {
			const message = JSON.parse(String(raw)) as Record<string, unknown>;
			const answer = (result: unknown, success = true) =>
				socket.send(
					JSON.stringify({
						id: message.id,
						type: "result",
						success,
						result,
						...(success ? {} : { error: { message: "Service not found" } }),
					}),
				);
			if (message.type === "auth") {
				socket.send(
					JSON.stringify({
						type:
							message.access_token === "good-token"
								? "auth_ok"
								: "auth_invalid",
					}),
				);
			} else if (message.type === "get_states") {
				answer(states);
			} else if (message.type === "subscribe_events") {
				answer(null);
			} else if (message.type === "call_service") {
				calls.push({
					domain: String(message.domain),
					service: String(message.service),
					data: message.service_data,
					entity: (message.target as { entity_id?: unknown }).entity_id,
				});
				answer(null, !refuseService);
			}
		},
	},
});

const url = `http://127.0.0.1:${server.port}`;
const named = (name: string) =>
	DeviceDTO.all().find((device) => device.name === name) as DeviceDTO;

function pushState(entity: Record<string, unknown>) {
	for (const socket of sockets) {
		socket.send(
			JSON.stringify({
				id: 2,
				type: "event",
				event: {
					event_type: "state_changed",
					data: { entity_id: entity.entity_id, new_state: entity },
				},
			}),
		);
	}
}

afterAll(async () => {
	await plugins.stop("home-assistant");
	await server.stop(true);
});

beforeEach(async () => {
	resetDatabase();
	await plugins.stop("home-assistant");
	calls.length = 0;
	proxyTokens.length = 0;
	refuseService = false;
});

describe("Home Assistant", () => {
	test("connects with a token, imports what has a card and drives it through services", async () => {
		const homeAssistant = hosted("home-assistant");
		await expect(
			pluginSetup.connect(homeAssistant, homeId(), { url, token: "bad-token" }),
		).rejects.toThrow("refused the token");
		expect(
			await pluginSetup.connect(homeAssistant, homeId(), {
				url,
				token: "good-token",
			}),
		).toBe(8);
		expect(named("Desk lamp").state).toMatchObject({
			type: "light",
			on: true,
			features: [],
		});
		expect(named("sensor.temperature").state).toEqual({
			type: "sensor",
			readings: [{ name: "temperature", value: 20, unit: null }],
		});
		expect(named("Living blind").state).toEqual({
			type: "cover",
			position: 60,
		});
		expect(named("Office").state).toMatchObject({
			power: true,
			mode: "heat",
			modes: ["heat", "auto", "fan"],
			targetTemperature: 21,
			roomTemperature: 19.5,
		});
		expect(named("Front door").state).toMatchObject({ open: false });
		expect(named("sensor.grid_power").state).toMatchObject({ power: 1200 });
		expect(named("sensor.grid_energy").state).toMatchObject({ energy: 2.5 });
		expect(named("Porch").state).toMatchObject({
			source: "Home Assistant",
			snapshot: "snapshot.jpg",
		});

		await devices.command(named("Desk lamp"), {
			type: "light",
			change: { on: false },
		});
		await devices.command(named("Living blind"), {
			type: "cover",
			move: { action: "stop" },
		});
		await devices.command(named("Living blind"), {
			type: "cover",
			move: { position: 30 },
		});
		await devices.command(named("Office"), {
			type: "climate",
			change: { mode: "auto", targetTemperature: 20 },
		});
		await devices.command(named("Office"), {
			type: "climate",
			change: { power: false },
		});
		await devices.command(named("Office"), {
			type: "climate",
			change: { power: true },
		});
		expect(calls).toEqual([
			{
				domain: "light",
				service: "turn_off",
				data: {},
				entity: "light.desk",
			},
			{
				domain: "cover",
				service: "stop_cover",
				data: {},
				entity: "cover.living",
			},
			{
				domain: "cover",
				service: "set_cover_position",
				data: { position: 30 },
				entity: "cover.living",
			},
			{
				domain: "climate",
				service: "set_hvac_mode",
				data: { hvac_mode: "heat_cool" },
				entity: "climate.office",
			},
			{
				domain: "climate",
				service: "set_temperature",
				data: { temperature: 20 },
				entity: "climate.office",
			},
			{
				domain: "climate",
				service: "set_hvac_mode",
				data: { hvac_mode: "off" },
				entity: "climate.office",
			},
			{
				domain: "climate",
				service: "turn_on",
				data: {},
				entity: "climate.office",
			},
		]);
		expect(named("Desk lamp").state).toMatchObject({ on: false });
		expect(named("Office").state).toMatchObject({
			power: true,
			mode: "auto",
			targetTemperature: 20,
		});

		const added = (kind: string, externalId: string, state: DeviceState) => {
			const device = DeviceDTO.upsert({
				kind,
				homeId: homeId(),
				name: externalId,
				roomId: null,
				externalId,
				host: null,
				fields: {},
			});
			device.saveState(state);
			return () => named(externalId);
		};
		const lock = added("home-assistant-lock", "lock.front", {
			type: "lock",
			locked: false,
			jammed: true,
			battery: null,
		});
		const fan = added("home-assistant-fan", "fan.bedroom", {
			type: "fan",
			on: false,
			speed: 0,
			speedSteps: 4,
			oscillating: false,
		});
		const speaker = added("home-assistant-media", "media_player.kitchen", {
			type: "media",
			power: true,
			playback: "paused",
			title: null,
			artist: null,
			volume: 10,
			muted: false,
			source: null,
			sources: [],
		});
		const scene = added("home-assistant-button", "scene.movie", {
			type: "button",
			pressedAt: null,
		});
		await devices.command(lock(), { type: "lock", locked: true });
		await devices.command(fan(), { type: "fan", change: { speed: 50 } });
		await devices.command(speaker(), {
			type: "media",
			change: { action: "play", volume: 20 },
		});
		await devices.command(scene(), { type: "button" });
		expect(lock().state).toMatchObject({ locked: true, jammed: false });
		expect(fan().state).toMatchObject({ speed: 50 });
		expect(speaker().state).toMatchObject({ playback: "playing", volume: 20 });
		await devices.command(speaker(), {
			type: "media",
			change: { action: "stop" },
		});
		expect(speaker().state).toMatchObject({ playback: "idle" });
		expect(
			(scene().state as { pressedAt: string | null }).pressedAt,
		).not.toBeNull();

		refuseService = true;
		await expect(
			devices.command(named("Desk lamp"), {
				type: "light",
				change: { on: true },
			}),
		).rejects.toThrow("Home Assistant refused it: Service not found.");
		await expect(
			devices.command(named("Front door"), { type: "switch", on: true }),
		).rejects.toThrow("not a switch");
		expect(() =>
			haMapping.services(
				"home-assistant-contact",
				{ type: "switch", on: true },
				[],
				"binary_sensor.front_door",
			),
		).toThrow("doesn't take that command");
	});

	test("follows state changes live and serves camera pictures", async () => {
		await pluginSetup.connect(hosted("home-assistant"), homeId(), {
			url,
			token: "good-token",
			headers: "X-Proxy-Token: pangolin",
		});
		await plugins.start("home-assistant");
		await plugin.keepConnected(context);
		pushState({ entity_id: "light.desk", state: "off", attributes: {} });
		pushState({
			entity_id: "binary_sensor.front",
			state: "on",
			attributes: { device_class: "door" },
		});
		pushState({ entity_id: "light.unknown", state: "on", attributes: {} });
		await Bun.sleep(20);
		plugin.flush(context);
		plugin.flush(context);
		expect(named("Desk lamp").state).toMatchObject({ on: false });
		expect(named("Front door").state).toMatchObject({ open: true });

		const snapshot = await hosted("home-assistant").plugin.serve?.(
			seen(named("Porch")),
			"snapshot.jpg",
			new Request("http://localhost/"),
			context,
		);
		expect(await snapshot?.text()).toBe("jpeg");
		expect(snapshot?.headers.get("content-type")).toBe("image/jpeg");
		expect(proxyTokens.at(-1)).toBe("pangolin");
		expect(proxyTokens).toContain("pangolin");
		expect(
			(
				await hosted("home-assistant").plugin.serve?.(
					seen(named("Porch")),
					"other",
					new Request("http://localhost/"),
					context,
				)
			)?.status,
		).toBe(404);
		await expect(
			hosted("home-assistant").plugin.serve?.(
				seen(named("Porch")),
				"stream",
				new Request("http://localhost/"),
				context,
			),
		).rejects.toThrow("Home Assistant answered 404.");
		for (const socket of sockets) {
			socket.close();
		}
		await Bun.sleep(20);
		await plugin.keepConnected(context);
		expect(sockets.size).toBe(1);
		await plugins.stop("home-assistant");
	});

	test("explains unreachable addresses and a missing connection", async () => {
		await expect(haClient.open("http://127.0.0.1:1", "x")).rejects.toThrow(
			"can't be reached",
		);
		await expect(haClient.open("not a url", "x")).rejects.toThrow(
			"isn't a Home Assistant address",
		);
		expect(haClient.socketUrl("https://ha.local:8123/")).toBe(
			"wss://ha.local:8123/api/websocket",
		);
		await expect(
			hosted("home-assistant").plugin.discover?.(context),
		).rejects.toThrow("Connect Home Assistant first.");
		await plugins.start("home-assistant");
		expect(
			haMapping.state("home-assistant-switch", {
				entity_id: "switch.x",
				state: "unavailable",
				attributes: {},
			}),
		).toMatchObject({ on: null });
		expect(
			haMapping.state("home-assistant-cover", {
				entity_id: "cover.x",
				state: "opening",
				attributes: {},
			}),
		).toEqual({ type: "cover", position: null });
		expect(
			haMapping.state("home-assistant-climate", {
				entity_id: "climate.x",
				state: "unknown",
				attributes: {},
			}),
		).toMatchObject({ offline: true, power: false, modes: [] });
	});

	test("maps lights, locks, fans, media players, sensors and buttons both ways", () => {
		const entity = (
			entityId: string,
			state: string,
			attributes: Record<string, unknown> = {},
		) => ({ entity_id: entityId, state, attributes });
		const kind = (entityId: string, attributes: Record<string, unknown> = {}) =>
			haMapping.kind(entity(entityId, "on", attributes));
		expect(kind("light.a")).toBe("home-assistant-light");
		expect(kind("lock.a")).toBe("home-assistant-lock");
		expect(kind("fan.a")).toBe("home-assistant-fan");
		expect(kind("media_player.a")).toBe("home-assistant-media");
		expect(kind("scene.a")).toBe("home-assistant-button");
		expect(kind("input_boolean.a")).toBe("home-assistant-switch");
		expect(kind("sensor.a", { state_class: "measurement" })).toBe(
			"home-assistant-sensor",
		);
		expect(kind("binary_sensor.a", { device_class: "motion" })).toBe(
			"home-assistant-sensor",
		);
		expect(kind("sensor.sun_next_dawn")).toBeNull();
		expect(kind("automation.a")).toBeNull();

		expect(
			haMapping.state(
				"home-assistant-light",
				entity("light.a", "on", {
					supported_color_modes: ["color_temp", "hs"],
					brightness: 128,
					color_temp_kelvin: 3000,
					min_color_temp_kelvin: 2200,
					max_color_temp_kelvin: 6000,
					hs_color: [30, 40],
				}),
			),
		).toEqual({
			type: "light",
			on: true,
			brightness: 50,
			temperature: 3000,
			minTemperature: 2200,
			maxTemperature: 6000,
			color: { hue: 30, saturation: 40 },
			features: ["brightness", "temperature", "color"],
		});
		expect(
			haMapping.state("home-assistant-lock", entity("lock.a", "jammed")),
		).toEqual({ type: "lock", locked: false, jammed: true, battery: null });
		expect(
			haMapping.state("home-assistant-lock", entity("lock.a", "unavailable")),
		).toMatchObject({ locked: null });
		expect(
			haMapping.state(
				"home-assistant-fan",
				entity("fan.a", "on", {
					percentage: 50,
					percentage_step: 25,
					oscillating: true,
				}),
			),
		).toEqual({
			type: "fan",
			on: true,
			speed: 50,
			speedSteps: 4,
			oscillating: true,
		});
		expect(
			haMapping.state("home-assistant-fan", entity("fan.a", "off")),
		).toMatchObject({ speedSteps: 0, oscillating: null });
		expect(
			haMapping.state(
				"home-assistant-media",
				entity("media_player.a", "playing", {
					media_title: "Song",
					media_artist: "Band",
					volume_level: 0.25,
					is_volume_muted: false,
					source: "Radio",
					source_list: ["Radio", "TV"],
				}),
			),
		).toEqual({
			type: "media",
			power: true,
			playback: "playing",
			title: "Song",
			artist: "Band",
			volume: 25,
			muted: false,
			source: "Radio",
			sources: ["Radio", "TV"],
		});
		expect(
			haMapping.state("home-assistant-media", entity("media_player.a", "off")),
		).toMatchObject({
			power: false,
			playback: null,
			volume: null,
			sources: [],
		});
		expect(
			haMapping.state(
				"home-assistant-button",
				entity("button.a", "2026-01-02T03:04:05+00:00"),
			),
		).toEqual({ type: "button", pressedAt: "2026-01-02T03:04:05.000Z" });
		expect(
			haMapping.state("home-assistant-button", entity("script.a", "off")),
		).toEqual({ type: "button", pressedAt: null });
		expect(
			haMapping.state(
				"home-assistant-sensor",
				entity("binary_sensor.a", "on", { device_class: "motion" }),
			),
		).toMatchObject({ readings: [{ name: "motion", value: true }] });
		expect(
			haMapping.state(
				"home-assistant-sensor",
				entity("sensor.a", "unknown", { unit_of_measurement: "ppm" }),
			),
		).toEqual({
			type: "sensor",
			readings: [{ name: "Value", value: null, unit: "ppm" }],
		});

		expect(kind("person.ada")).toBe("home-assistant-presence");
		expect(
			haMapping.state(
				"home-assistant-presence",
				entity("person.ada", "home", { battery_level: 80 }),
			),
		).toEqual({ type: "presence", home: true, zone: null, battery: 80 });
		expect(
			haMapping.state(
				"home-assistant-presence",
				entity("device_tracker.a", "Work"),
			),
		).toEqual({ type: "presence", home: false, zone: "Work", battery: null });
		expect(
			haMapping.state(
				"home-assistant-presence",
				entity("person.ada", "unavailable"),
			),
		).toMatchObject({ home: null, zone: null });

		expect(
			haMapping.services(
				"home-assistant-switch",
				{ type: "switch", on: true },
				[],
				"switch.a",
			),
		).toEqual([{ domain: "homeassistant", service: "turn_on", data: {} }]);
		expect(
			haMapping.services(
				"home-assistant-light",
				{
					type: "light",
					change: {
						brightness: 40,
						temperature: 2700,
						color: { hue: 10, saturation: 20 },
					},
				},
				[],
				"light.a",
			),
		).toEqual([
			{
				domain: "light",
				service: "turn_on",
				data: {
					brightness_pct: 40,
					color_temp_kelvin: 2700,
					hs_color: [10, 20],
				},
			},
		]);
		expect(
			haMapping.services(
				"home-assistant-lock",
				{ type: "lock", locked: true },
				[],
				"lock.a",
			),
		).toEqual([{ domain: "lock", service: "lock", data: {} }]);
		expect(
			haMapping.services(
				"home-assistant-fan",
				{ type: "fan", change: { on: false, speed: 20, oscillating: true } },
				[],
				"fan.a",
			),
		).toEqual([
			{ domain: "fan", service: "turn_off", data: {} },
			{ domain: "fan", service: "set_percentage", data: { percentage: 20 } },
			{ domain: "fan", service: "oscillate", data: { oscillating: true } },
		]);
		expect(
			haMapping.services(
				"home-assistant-media",
				{
					type: "media",
					change: {
						power: true,
						action: "next",
						volume: 30,
						muted: true,
						source: "TV",
					},
				},
				[],
				"media_player.a",
			),
		).toEqual([
			{ domain: "media_player", service: "turn_on", data: {} },
			{ domain: "media_player", service: "media_next_track", data: {} },
			{
				domain: "media_player",
				service: "volume_set",
				data: { volume_level: 0.3 },
			},
			{
				domain: "media_player",
				service: "volume_mute",
				data: { is_volume_muted: true },
			},
			{
				domain: "media_player",
				service: "select_source",
				data: { source: "TV" },
			},
		]);
		expect(
			haMapping.services(
				"home-assistant-button",
				{ type: "button" },
				[],
				"input_button.a",
			),
		).toEqual([{ domain: "input_button", service: "press", data: {} }]);
		expect(
			haMapping.services(
				"home-assistant-button",
				{ type: "button" },
				[],
				"scene.a",
			),
		).toEqual([{ domain: "scene", service: "turn_on", data: {} }]);
	});
});
