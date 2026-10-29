import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import type { ServerWebSocket } from "bun";

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

const server = Bun.serve({
	port: 0,
	fetch(request, self) {
		const url = new URL(request.url);
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
		).toBe(7);
		expect(named("Desk lamp").state).toMatchObject({
			type: "switch",
			on: true,
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

		await devices.command(named("Desk lamp"), { type: "switch", on: false });
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
				domain: "homeassistant",
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

		refuseService = true;
		await expect(
			devices.command(named("Desk lamp"), { type: "switch", on: true }),
		).rejects.toThrow("Home Assistant refused it: Service not found.");
		await expect(
			devices.command(named("Front door"), { type: "switch", on: true }),
		).rejects.toThrow("not a switch");
		expect(() =>
			haMapping.services(
				"home-assistant-contact",
				{ type: "switch", on: true },
				[],
			),
		).toThrow("doesn't take that command");
	});

	test("follows state changes live and serves camera pictures", async () => {
		await pluginSetup.connect(hosted("home-assistant"), homeId(), {
			url,
			token: "good-token",
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
});
