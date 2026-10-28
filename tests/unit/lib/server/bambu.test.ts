import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

import { DeviceDTO } from "#lib/dto/device.js";
import { secrets } from "#lib/server/core/secrets.js";

import { homeId, resetDatabase } from "../../database.js";

interface Published {
	topic: string;
	payload: Record<string, Record<string, unknown>>;
	qos?: number;
}

const broker = {
	connections: [] as { url: string; options: Record<string, unknown> }[],
	published: [] as Published[],
	ended: 0,
	refuse: false,
	unreachable: false,
	result: "success" as string | undefined,
	report: {
		gcode_state: "RUNNING",
		mc_percent: 42,
		mc_remaining_time: 75,
		subtask_name: "benchy",
		layer_num: 120,
		total_layer_num: 300,
		nozzle_temper: 219.6,
		nozzle_target_temper: 220,
		bed_temper: 60,
		bed_target_temper: 60,
		lights_report: [{ node: "chamber_light", mode: "on" }],
		spd_lvl: 2,
	} as Record<string, unknown>,
	clients: [] as FakeClient[],
};

class FakeClient extends EventEmitter {
	constructor() {
		super();
		setTimeout(() => {
			if (broker.refuse) {
				this.emit("error", new Error("Connection refused: Not authorized"));
			} else if (broker.unreachable) {
				this.emit("offline");
				this.emit("close");
			} else {
				this.emit("connect");
			}
		}, 1);
	}

	subscribe() {
		return this;
	}

	subscribeAsync() {
		return Promise.resolve([]);
	}

	publish(topic: string, payload: string) {
		const parsed = JSON.parse(payload) as Published["payload"];
		broker.published.push({ topic, payload: parsed });
		if (parsed.pushing?.command === "pushall") {
			setTimeout(() => this.deliver({ print: broker.report }), 1);
		}
		return this;
	}

	publishAsync(topic: string, payload: string, options: { qos: number }) {
		const parsed = JSON.parse(payload) as Published["payload"];
		broker.published.push({ topic, payload: parsed, qos: options.qos });
		const [section, body] = Object.entries(parsed)[0] ?? [];
		if (section && body && broker.result !== undefined) {
			setTimeout(
				() =>
					this.deliver({
						[section]: {
							command: body.command,
							sequence_id: body.sequence_id,
							result: broker.result,
						},
					}),
				1,
			);
		}
		return Promise.resolve(undefined);
	}

	deliver(message: Record<string, unknown>) {
		this.emit("message", "device/report", Buffer.from(JSON.stringify(message)));
	}

	end() {
		broker.ended += 1;
		this.removeAllListeners();
		return this;
	}
}

mock.module("mqtt", () => ({
	default: {
		connect: (url: string, options: Record<string, unknown>) => {
			broker.connections.push({ url, options });
			const client = new FakeClient();
			broker.clients.push(client);
			return client;
		},
	},
}));

const { bambuPrinters } = await import("#lib/server/devices/bambu.js");
const { devices } = await import("#lib/server/devices/devices.js");

function addPrinter(code = "12345678") {
	return DeviceDTO.upsert({
		homeId: homeId(),
		kind: "bambu-printer",
		name: "P1S",
		externalId: "01P00A000000000",
		host: "192.168.1.50",
		encryptedLocalKey: secrets.encrypt(code),
	});
}

beforeEach(() => {
	resetDatabase();
	bambuPrinters.forgetExcept(new Set());
	broker.connections = [];
	broker.published = [];
	broker.clients = [];
	broker.ended = 0;
	broker.refuse = false;
	broker.unreachable = false;
	broker.result = "success";
});

describe("Bambu Lab printers", () => {
	test("connects with the access code, asks for everything once and maps the report", async () => {
		const printer = addPrinter();
		await devices.refresh(printer);
		expect(broker.connections[0]).toMatchObject({
			url: "mqtts://192.168.1.50:8883",
			options: {
				username: "bblp",
				password: "12345678",
				rejectUnauthorized: false,
			},
		});
		expect(broker.published[0]).toMatchObject({
			topic: "device/01P00A000000000/request",
			payload: { pushing: { command: "pushall" } },
		});
		expect(DeviceDTO.find(printer.id)?.state).toEqual({
			type: "printer",
			stage: "printing",
			progress: 42,
			remainingMinutes: 75,
			fileName: "benchy",
			layer: 120,
			totalLayers: 300,
			nozzle: { temperature: 219.6, target: 220 },
			bed: { temperature: 60, target: 60 },
			light: true,
			speed: 2,
		});
	});

	test("keeps one connection and merges what the printer pushes after", async () => {
		const printer = addPrinter();
		await devices.refresh(printer);
		broker.clients[0]?.deliver({
			print: { mc_percent: 43, gcode_state: "PAUSE" },
		});
		broker.clients[0]?.deliver({ system: { command: "ledctrl" } });
		broker.clients[0]?.emit("message", "device/report", Buffer.from("{oops"));
		await devices.refresh(DeviceDTO.find(printer.id) ?? printer);
		expect(broker.connections).toHaveLength(1);
		expect(DeviceDTO.find(printer.id)?.state).toMatchObject({
			stage: "paused",
			progress: 43,
			layer: 120,
		});
		printer.reconnect({
			name: "P1S",
			roomId: null,
			host: "192.168.1.51",
			encryptedLocalKey: secrets.encrypt("87654321"),
		});
		await devices.refresh(DeviceDTO.find(printer.id) ?? printer);
		expect(broker.connections).toHaveLength(2);
		expect(broker.ended).toBe(1);
		expect(DeviceDTO.find(printer.id)?.toJSON().host).toBe("192.168.1.51");
		await devices.refreshAll();
		printer.delete();
		await devices.refreshAll();
		expect(broker.ended).toBe(2);
	});

	test("explains a refused access code and a printer that's off", async () => {
		const printer = addPrinter();
		broker.refuse = true;
		await devices.refresh(printer);
		expect(DeviceDTO.find(printer.id)?.toJSON().stateError).toBe(
			"The printer refused the access code.",
		);
		bambuPrinters.forgetExcept(new Set());
		broker.refuse = false;
		broker.unreachable = true;
		await devices.refresh(printer);
		expect(DeviceDTO.find(printer.id)?.toJSON().stateError).toBe(
			"The printer is off or unreachable.",
		);
		await expect(
			devices.printer(printer, { command: "pause" }),
		).rejects.toThrow("off or unreachable");
		const bare = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "bambu-printer",
			name: "Bare",
			externalId: "01P00A000000001",
		});
		await expect(bambuPrinters.read(bare)).rejects.toThrow(
			"no address or access code",
		);
	});

	test("pauses, lights and sets the speed, and says when Developer Mode is off", async () => {
		const printer = addPrinter();
		await devices.printer(printer, {
			command: "pause",
			light: false,
			speed: 3,
		});
		expect(broker.published.map((entry) => entry.payload)).toMatchObject([
			{ print: { command: "pause", param: "" } },
			{
				system: {
					command: "ledctrl",
					led_node: "chamber_light",
					led_mode: "off",
				},
			},
			{ print: { command: "print_speed", param: "3" } },
		]);
		expect(broker.published.every((entry) => entry.qos === 1)).toBe(true);
		expect(broker.ended).toBe(3);
		broker.result = "failed";
		await expect(devices.printer(printer, { command: "stop" })).rejects.toThrow(
			"Developer Mode",
		);
		broker.refuse = true;
		await expect(devices.printer(printer, { light: true })).rejects.toThrow(
			"refused the access code",
		);
		const heater = DeviceDTO.upsert({
			homeId: homeId(),
			kind: "melcloud-ata",
			name: "Heat",
			externalId: "77",
		});
		await expect(devices.printer(heater, { command: "pause" })).rejects.toThrow(
			"not a printer",
		);
		await expect(devices.climate(printer, { power: true })).rejects.toThrow(
			"not a heat pump",
		);
	});

	test("maps unknown stages, odd speeds, no light and no file name", () => {
		expect(
			bambuPrinters.state({
				gcode_state: "SOMETHING",
				spd_lvl: 9,
				subtask_name: "",
				lights_report: "nope",
			}),
		).toMatchObject({
			stage: "idle",
			speed: null,
			fileName: null,
			light: null,
			progress: null,
		});
	});
});
