import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

import type { ValveState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import {
	getSetting,
	type MqttBroker,
	setPluginSettings,
	setSetting,
} from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { deviceEvents } from "#lib/server/devices/device-events.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { zigbee } from "#plugins/zigbee/mapping.js";

import { homeId, resetDatabase } from "../database.js";
import { hosted, pluginOf } from "./support.js";

const published: { topic: string; payload: string }[] = [];
const subscribed: (string | string[])[] = [];
let connectAs: "ok" | "refused" | "unreachable" = "ok";

class FakeClient extends EventEmitter {
	connected = false;

	constructor() {
		super();
		queueMicrotask(() => {
			if (connectAs === "ok") {
				this.connected = true;
				this.emit("connect");
			} else if (connectAs === "refused") {
				this.emit("error", new Error("Connection refused: Not authorized"));
			} else {
				this.emit("close");
			}
		});
	}

	subscribe(topic: string | string[]) {
		subscribed.push(topic);
	}

	unsubscribe(topic: string | string[]) {
		subscribed.push(`-${String(topic)}`);
	}

	publishAsync(topic: string, payload: string) {
		published.push({ topic, payload });
		return Promise.resolve();
	}

	end() {
		this.connected = false;
	}
}

mock.module("mqtt", () => ({ default: { connect: () => new FakeClient() } }));

const { broker } = await import("#lib/server/devices/broker.js");
const { devices } = await import("#lib/server/devices/devices.js");
const { jobHandlers } = await import("#lib/server/jobs/handlers.js");

const plugin = pluginOf<{
	handle(
		context: unknown,
		topic: string,
		received: string,
		payload: Buffer,
	): void;
	flush(context: unknown): void;
}>("zigbee");
const context = hosted("zigbee").context;
const handle = (topic: string, payload: string) =>
	plugin.handle(context, "zigbee2mqtt", topic, Buffer.from(payload));
const bridge = [
	{ ieee_address: "0x00", friendly_name: "Coordinator", type: "Coordinator" },
	{
		ieee_address: "0x01",
		friendly_name: "Bedroom window",
		definition: { exposes: [{ type: "binary", property: "contact" }] },
	},
	{
		ieee_address: "0x02",
		friendly_name: "Bedroom radiator",
		definition: {
			exposes: [
				{
					type: "climate",
					features: [
						{
							property: "occupied_heating_setpoint",
							value_min: 4,
							value_max: 35,
						},
						{ property: "local_temperature" },
					],
				},
			],
		},
	},
	{
		ieee_address: "0x03",
		friendly_name: "Dryer",
		definition: {
			exposes: [
				{ type: "switch", features: [{ property: "state" }] },
				{ property: "power" },
				{ property: "energy" },
			],
		},
	},
	{
		ieee_address: "0x04",
		friendly_name: "Linky",
		definition: { model: "ZLinky_TIC", exposes: [] },
	},
	{
		ieee_address: "0x05",
		friendly_name: "Button",
		definition: { exposes: [{ property: "action" }] },
	},
	{ ieee_address: "0x06", friendly_name: "Unknown", definition: null },
];

function settings(): MqttBroker {
	return {
		url: "mqtt://broker.local:1883",
		username: "home",
		encryptedPassword: secrets.encrypt("secret"),
		homeId: homeId(),
	};
}

const byName = (name: string) =>
	DeviceDTO.all().find((device) => device.toJSON().name === name) as DeviceDTO;

function connectZigbee() {
	setPluginSettings("zigbee", {
		homeId: homeId(),
		values: { topic: "zigbee2mqtt" },
		secrets: {},
	});
}

beforeEach(async () => {
	resetDatabase();
	await plugins.stop("zigbee");
	published.length = 0;
	subscribed.length = 0;
	connectAs = "ok";
	broker.stop();
	connectZigbee();
});

describe("Zigbee2MQTT", () => {
	test("classifies what it lists and skips what it can't show", () => {
		expect(zigbee.devices(bridge).map((device) => device.kind)).toEqual([
			"zigbee-contact",
			"zigbee-valve",
			"zigbee-switch",
			"zigbee-meter",
		]);
		const valve = zigbee.devices(bridge)[1]?.state as ValveState;
		expect(valve).toMatchObject({
			setpoint: "occupied_heating_setpoint",
			min: 4,
			max: 35,
		});
		expect(
			zigbee.devices([
				{
					ieee_address: "0x07",
					friendly_name: "Old valve",
					definition: { exposes: [{ property: "current_heating_setpoint" }] },
				},
			])[0]?.state,
		).toMatchObject({ setpoint: "current_heating_setpoint", min: 5, max: 30 });
	});

	test("imports the device list, saves reports and tells listeners about doors at once", async () => {
		handle("zigbee2mqtt/bridge/devices", JSON.stringify(bridge));
		expect(DeviceDTO.inHome(homeId())).toHaveLength(4);
		const window = byName("Bedroom window");
		window.rename("Window", null);
		handle("zigbee2mqtt/bridge/devices", JSON.stringify(bridge));
		expect(byName("Window").kind).toBe("zigbee-contact");

		const heard: boolean[] = [];
		deviceEvents.onContact((_device, next) => {
			if (next.open !== null) {
				heard.push(next.open);
			}
		});
		handle(
			"zigbee2mqtt/Bedroom window",
			JSON.stringify({ contact: false, battery: 90 }),
		);
		expect(byName("Window").state).toEqual({
			type: "contact",
			open: true,
			battery: 90,
		});
		await Bun.sleep(1);
		expect(heard).toEqual([true]);

		handle(
			"zigbee2mqtt/Bedroom radiator",
			JSON.stringify({
				occupied_heating_setpoint: 21,
				local_temperature: 19.5,
			}),
		);
		handle(
			"zigbee2mqtt/Dryer",
			JSON.stringify({ state: "ON", power: 2100, energy: 12.4 }),
		);
		handle(
			"zigbee2mqtt/Linky",
			JSON.stringify({
				apparent_power: 1800,
				current_summation_delivered: 41000,
			}),
		);
		expect(byName("Bedroom radiator").state).toMatchObject({ target: null });
		plugin.flush(context);
		expect(byName("Bedroom radiator").state).toMatchObject({
			target: 21,
			temperature: 19.5,
		});
		expect(byName("Dryer").state).toEqual({
			type: "switch",
			on: true,
			power: 2100,
			energy: 12.4,
		});
		expect(byName("Linky").state).toEqual({
			type: "meter",
			power: 1800,
			energy: 41000,
		});

		for (const ignored of [
			["zigbee2mqtt/bridge/state", "online"],
			["zigbee2mqtt/Dryer/set", "{}"],
			["zigbee2mqtt/Nobody", "{}"],
			["zigbee2mqtt/Dryer", "not json"],
			["zigbee2mqtt/Dryer", "[1]"],
		] as const) {
			handle(ignored[0], ignored[1]);
		}
		plugin.flush(context);
		expect(byName("Dryer").state).toMatchObject({ power: 2100 });
		handle("zigbee2mqtt/bridge/devices", "{}");
	});

	test("commands go out on the worker's connection, or a short one, and refuse other devices", async () => {
		handle("zigbee2mqtt/bridge/devices", JSON.stringify(bridge));
		handle(
			"zigbee2mqtt/Bedroom radiator",
			JSON.stringify({ occupied_heating_setpoint: 21 }),
		);
		handle("zigbee2mqtt/Dryer", JSON.stringify({ state: "OFF" }));
		plugin.flush(context);
		await expect(
			devices.command(byName("Dryer"), { type: "valve", target: 20 }),
		).rejects.toThrow("not a radiator valve");
		await expect(
			devices.command(byName("Linky"), { type: "switch", on: true }),
		).rejects.toThrow("not a switch");
		await expect(
			devices.command(byName("Bedroom radiator"), {
				type: "valve",
				target: 20,
			}),
		).rejects.toThrow("Connect the MQTT broker first.");
		setSetting("mqtt", settings());
		await devices.command(byName("Bedroom radiator"), {
			type: "valve",
			target: 50,
		});
		expect(published.at(-1)).toEqual({
			topic: "zigbee2mqtt/Bedroom radiator/set",
			payload: JSON.stringify({ occupied_heating_setpoint: 35 }),
		});
		expect(byName("Bedroom radiator").state).toMatchObject({ target: 35 });
		await jobHandlers["plugins.restart"]({ pluginId: "zigbee" });
		await jobHandlers["broker.connect"]({});
		await Bun.sleep(5);
		expect(subscribed).toEqual([["zigbee2mqtt/#"]]);
		await devices.command(byName("Dryer"), { type: "switch", on: true });
		expect(published.at(-1)?.payload).toBe(JSON.stringify({ state: "ON" }));
		expect(byName("Dryer").state).toMatchObject({ on: true });
		await devices.refresh(byName("Dryer"));
		await plugins.stop("zigbee");
		expect(subscribed.at(-1)).toBe("-zigbee2mqtt/#");
		broker.stop();
	});

	test("brings lights and locks in, reads them and drives them", async () => {
		const lights = [
			{
				ieee_address: "0x10",
				friendly_name: "Hall bulb",
				definition: {
					exposes: [
						{
							type: "light",
							features: [
								{ property: "state" },
								{ property: "brightness" },
								{ property: "color_temp", value_min: 150, value_max: 500 },
								{ property: "color_hs" },
							],
						},
					],
				},
			},
			{
				ieee_address: "0x11",
				friendly_name: "Front lock",
				definition: {
					exposes: [
						{ type: "lock", features: [{ property: "state" }] },
						{ property: "battery" },
					],
				},
			},
			{
				ieee_address: "0x12",
				friendly_name: "Old bulb",
				definition: {
					exposes: [{ type: "light", features: [{ property: "state" }] }],
				},
			},
		];
		DeviceDTO.upsert({
			kind: "zigbee-switch",
			homeId: homeId(),
			name: "Old bulb",
			roomId: null,
			externalId: "0x12",
			host: "Old bulb",
			fields: {},
		});
		handle("zigbee2mqtt/bridge/devices", JSON.stringify(lights));
		expect(byName("Hall bulb").state).toMatchObject({
			type: "light",
			minTemperature: 2000,
			maxTemperature: 6667,
			features: ["brightness", "temperature", "color"],
		});
		expect(byName("Front lock").kind).toBe("zigbee-lock");
		expect(byName("Old bulb").kind).toBe("zigbee-switch");
		handle(
			"zigbee2mqtt/Hall bulb",
			JSON.stringify({
				state: "ON",
				brightness: 127,
				color_temp: 250,
				color: { hue: 40, saturation: 60 },
			}),
		);
		handle(
			"zigbee2mqtt/Front lock",
			JSON.stringify({ lock_state: "locked", battery: 80 }),
		);
		plugin.flush(context);
		expect(byName("Hall bulb").state).toMatchObject({
			on: true,
			brightness: 50,
			temperature: 4000,
			color: { hue: 40, saturation: 60 },
		});
		expect(byName("Front lock").state).toEqual({
			type: "lock",
			locked: true,
			jammed: false,
			battery: 80,
		});
		handle(
			"zigbee2mqtt/Front lock",
			JSON.stringify({ lock_state: "not_fully_locked" }),
		);
		plugin.flush(context);
		expect(byName("Front lock").state).toMatchObject({ jammed: true });
		handle("zigbee2mqtt/Front lock", JSON.stringify({ state: "UNLOCK" }));
		plugin.flush(context);
		expect(byName("Front lock").state).toMatchObject({ locked: false });

		setSetting("mqtt", settings());
		await devices.command(byName("Hall bulb"), {
			type: "light",
			change: {
				brightness: 100,
				temperature: 2500,
				color: { hue: 1, saturation: 2 },
			},
		});
		expect(JSON.parse(published.at(-1)?.payload ?? "{}")).toEqual({
			state: "ON",
			brightness: 254,
			color_temp: 400,
			color: { hue: 1, saturation: 2 },
		});
		await devices.command(byName("Hall bulb"), {
			type: "light",
			change: { on: false },
		});
		expect(JSON.parse(published.at(-1)?.payload ?? "{}")).toEqual({
			state: "OFF",
		});
		expect(byName("Hall bulb").state).toMatchObject({ on: false });
		await devices.command(byName("Front lock"), { type: "lock", locked: true });
		expect(JSON.parse(published.at(-1)?.payload ?? "{}")).toEqual({
			state: "LOCK",
		});
		expect(byName("Front lock").state).toMatchObject({ locked: true });
		broker.stop();
	});

	test("checking a broker explains refusals and unreachable addresses", async () => {
		await broker.check(settings());
		connectAs = "refused";
		expect(broker.check(settings())).rejects.toThrow(
			"refused that username and password",
		);
		connectAs = "unreachable";
		expect(broker.check(settings())).rejects.toThrow("can't be reached");
		setSetting("mqtt", null);
		broker.restart();
		expect(getSetting("mqtt")).toBeNull();
		expect(broker.publish("a/b", "x")).rejects.toThrow(
			"Connect the MQTT broker first.",
		);
	});

	test("matches MQTT wildcards and hands a message only to matching subscribers", async () => {
		expect(broker.matches("a/+/c", "a/b/c")).toBe(true);
		expect(broker.matches("a/#", "a/b/c")).toBe(true);
		expect(broker.matches("a/+", "a/b/c")).toBe(false);
		expect(broker.matches("a/b", "a")).toBe(false);
		const heard: string[] = [];
		broker.subscribe("test", "x/+", (topic) => {
			heard.push(topic);
		});
		broker.subscribe("test", "x/fail", () => {
			throw new Error("boom");
		});
		broker.dispatch("x/1", Buffer.from(""));
		broker.dispatch("y/1", Buffer.from(""));
		broker.dispatch("x/fail", Buffer.from(""));
		await Bun.sleep(1);
		expect(heard).toEqual(["x/1", "x/fail"]);
		broker.unsubscribeAll("test");
		broker.dispatch("x/2", Buffer.from(""));
		await Bun.sleep(1);
		expect(heard).toHaveLength(2);
	});

	test("the plugin refuses to connect without a broker and starts only once connected", async () => {
		setSetting("mqtt", null);
		expect(plugin.connect?.({}, context)).rejects.toThrow(
			"Connect the MQTT broker first.",
		);
		setSetting("mqtt", settings());
		await plugin.connect?.({}, context);
		setPluginSettings("zigbee", null);
		await plugins.restart("zigbee");
		expect(subscribed).toEqual([]);
	});
});
