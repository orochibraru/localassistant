import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import { createMcpHandler } from "@modelcontextprotocol/server";

import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { RoomDTO } from "#lib/dto/room.js";
import { devices } from "#lib/server/devices/devices.js";
import { mcpEndpoint } from "#lib/server/mcp/server.js";

import { homeId, resetDatabase } from "../../database.js";

let sequence = 0;

async function rpc(method: string, params: Record<string, unknown> = {}) {
	sequence += 1;
	const response = await createMcpHandler(() => mcpEndpoint.server()).fetch(
		new Request("http://localhost/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				"mcp-protocol-version": "2025-06-18",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: sequence, method, params }),
		}),
	);
	const text = await response.text();
	const data = text.includes("data:")
		? text
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5))
				.join("")
		: text;
	return JSON.parse(data) as {
		result?: {
			tools?: { name: string }[];
			content?: { text: string }[];
			isError?: boolean;
		};
		error?: unknown;
	};
}

async function call(name: string, args: Record<string, unknown> = {}) {
	const reply = await rpc("tools/call", { name, arguments: args });
	const content = reply.result?.content?.[0]?.text ?? "";
	return { isError: reply.result?.isError === true, text: content };
}

describe("MCP tools", () => {
	beforeEach(resetDatabase);

	test("list every house tool", async () => {
		const reply = await rpc("tools/list");
		expect(reply.result?.tools?.map((tool) => tool.name).sort()).toEqual([
			"control_blind",
			"control_fan",
			"control_heat_pump",
			"control_light",
			"control_lock",
			"control_media",
			"control_printer",
			"control_room_blinds",
			"control_switch",
			"control_vacuum",
			"get_device",
			"list_homes",
			"list_house",
			"press_button",
		]);
	});

	test("the device control tools send their command to the device", async () => {
		const lamp = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "mqtt-discovery-light",
			name: "Lamp",
			externalId: "lamp",
			roomId: null,
			host: null,
			fields: {},
		});
		const sent: unknown[] = [];
		const command = spyOn(devices, "command").mockImplementation(
			(_device, order) => {
				sent.push(order);
				return Promise.resolve();
			},
		);
		const id = lamp.toJSON().id;
		await call("control_switch", { deviceId: id, on: true });
		await call("control_light", { deviceId: id, brightness: 40 });
		await call("control_lock", { deviceId: id, locked: true });
		await call("control_fan", { deviceId: id, speed: 30 });
		await call("control_media", { deviceId: id, action: "pause" });
		expect(await call("press_button", { deviceId: id })).toEqual({
			isError: false,
			text: JSON.stringify({ done: true }),
		});
		expect(sent).toEqual([
			{ type: "switch", on: true },
			{ type: "light", change: { brightness: 40 } },
			{ type: "lock", locked: true },
			{ type: "fan", change: { speed: 30 } },
			{ type: "media", change: { action: "pause" } },
			{ type: "button" },
		]);
		expect((await call("press_button", { deviceId: "missing" })).isError).toBe(
			true,
		);
		command.mockRestore();
	});

	test("list_house groups rooms by floor and lists devices with their room", async () => {
		const ground = FloorDTO.create(homeId(), "Ground floor", 0).toJSON().id;
		const kitchen = RoomDTO.create(homeId(), {
			name: "Kitchen",
			icon: "kitchen",
			floorId: ground,
			outdoor: false,
		}).toJSON().id;
		RoomDTO.create(homeId(), {
			name: "Garage",
			icon: "garage",
			floorId: null,
			outdoor: true,
		});
		const blind = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "tuya-cover",
			name: "Kitchen blind",
			externalId: "bf0000000000kitchen0",
			roomId: kitchen,
		});
		blind.saveState({ type: "cover", position: 40 });
		const house = JSON.parse((await call("list_house")).text) as {
			groups: { name: string; rooms: { name: string; kind: string }[] }[];
			devices: { name: string; roomId: string; state: unknown }[];
		};
		expect(house.groups).toEqual([
			{
				name: "Ground floor",
				rooms: [{ id: kitchen, name: "Kitchen", kind: "kitchen" }],
			},
			{ name: "Outside", rooms: [expect.objectContaining({ name: "Garage" })] },
		]);
		expect(house.devices[0]).toMatchObject({
			name: "Kitchen blind",
			roomId: kitchen,
			state: { type: "cover", position: 40 },
		});
		const one = JSON.parse(
			(await call("get_device", { deviceId: blind.id })).text,
		);
		expect(one).toMatchObject({ name: "Kitchen blind", error: null });
		expect((await call("get_device", { deviceId: "gone" })).isError).toBe(true);
		const homes = JSON.parse((await call("list_homes")).text) as {
			homes: { id: string }[];
		};
		expect(homes.homes.map((entry) => entry.id)).toEqual([homeId()]);
		expect((await call("list_house", { homeId: homeId() })).text).toContain(
			"Kitchen blind",
		);
		expect((await call("list_house", { homeId: "gone" })).isError).toBe(true);
		expect(
			(
				await call("control_room_blinds", {
					homeId: "gone",
					roomId: "house",
					action: "open",
				})
			).isError,
		).toBe(true);
	});

	test("controls report the device's own error instead of failing the call", async () => {
		const blind = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "tuya-cover",
			name: "Bare blind",
			externalId: "bf0000000000bare0000",
		});
		const heater = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "melcloud-atw",
			name: "PAC",
			externalId: "78",
		});
		const printer = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "bambu-printer",
			name: "P1S",
			externalId: "01P00A000000000",
		});
		expect(
			await call("control_blind", { deviceId: blind.id, action: "open" }),
		).toEqual({
			isError: true,
			text: "This cover has no address or local key.",
		});
		expect((await call("control_blind", { deviceId: blind.id })).text).toBe(
			"Give an action or a position.",
		);
		expect(
			(
				await call("control_heat_pump", {
					deviceId: heater.id,
					hotWaterBoost: true,
				})
			).text,
		).toBe("No MELCloud account is connected.");
		expect(
			(await call("control_printer", { deviceId: printer.id, light: true }))
				.text,
		).toBe("This printer has no address or access code.");
		expect(
			(await call("control_blind", { deviceId: "gone", position: 10 })).isError,
		).toBe(true);
		const room = JSON.parse(
			(await call("control_room_blinds", { roomId: "house", action: "close" }))
				.text,
		) as { blinds: number; failed: { name: string }[] };
		expect(room.blinds).toBe(1);
		expect(room.failed.map((entry) => entry.name)).toEqual(["Bare blind"]);
	});

	test("an AI app without a token is challenged, and plain HTTP is refused", async () => {
		const challenged = await mcpEndpoint.handle(
			new Request("http://localhost:3000/mcp", { method: "POST" }),
			new URL("http://localhost:3000/mcp"),
		);
		expect(challenged.status).toBe(401);
		expect(challenged.headers.get("www-authenticate")).toContain(
			"oauth-protected-resource",
		);
		const refused = await mcpEndpoint.handle(
			new Request("http://home.lan/mcp", { method: "POST" }),
			new URL("http://home.lan/mcp"),
		);
		expect(refused.status).toBe(404);
	});
});
