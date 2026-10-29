import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

import type { ValveState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { getSetting, type MqttBroker, setSetting } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";

import { homeId, resetDatabase } from "../../database.js";

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
const { zigbee } = await import("#lib/server/devices/zigbee.js");
const { devices } = await import("#lib/server/devices/devices.js");
const { jobHandlers } = await import("#lib/server/jobs/handlers.js");

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
		zigbeeTopic: "zigbee2mqtt",
		homeId: homeId(),
	};
}

const byName = (name: string) =>
	DeviceDTO.all().find((device) => device.toJSON().name === name) as DeviceDTO;

beforeEach(() => {
	resetDatabase();
	published.length = 0;
	subscribed.length = 0;
	connectAs = "ok";
	broker.stop();
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
		const config = settings();
		await broker.handle(
			config,
			"zigbee2mqtt/bridge/devices",
			JSON.stringify(bridge),
		);
		expect(DeviceDTO.inHome(homeId())).toHaveLength(4);
		const window = byName("Bedroom window");
		window.rename("Window", null);
		await broker.handle(
			config,
			"zigbee2mqtt/bridge/devices",
			JSON.stringify(bridge),
		);
		expect(byName("Window").kind).toBe("zigbee-contact");

		const heard: boolean[] = [];
		broker.onContact((_device, _previous, next) => {
			if (next.type === "contact" && next.open !== null) {
				heard.push(next.open);
			}
		});
		await broker.handle(
			config,
			"zigbee2mqtt/Bedroom window",
			JSON.stringify({ contact: false, battery: 90 }),
		);
		expect(byName("Window").state).toEqual({
			type: "contact",
			open: true,
			battery: 90,
		});
		expect(heard).toEqual([true]);

		await broker.handle(
			config,
			"zigbee2mqtt/Bedroom radiator",
			JSON.stringify({
				occupied_heating_setpoint: 21,
				local_temperature: 19.5,
			}),
		);
		await broker.handle(
			config,
			"zigbee2mqtt/Dryer",
			JSON.stringify({ state: "ON", power: 2100, energy: 12.4 }),
		);
		await broker.handle(
			config,
			"zigbee2mqtt/Linky",
			JSON.stringify({
				apparent_power: 1800,
				current_summation_delivered: 41000,
			}),
		);
		expect(byName("Bedroom radiator").state).toMatchObject({ target: null });
		broker.flush();
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
			["elsewhere/Dryer", "{}"],
			["zigbee2mqtt/Dryer", "[1]"],
		] as const) {
			await broker.handle(config, ignored[0], ignored[1]);
		}
		broker.flush();
		expect(byName("Dryer").state).toMatchObject({ power: 2100 });
		await broker.handle(config, "zigbee2mqtt/bridge/devices", "{}");
	});

	test("commands go out on the worker's connection, or a short one, and refuse other devices", async () => {
		const config = settings();
		await broker.handle(
			config,
			"zigbee2mqtt/bridge/devices",
			JSON.stringify(bridge),
		);
		await broker.handle(
			config,
			"zigbee2mqtt/Bedroom radiator",
			JSON.stringify({ occupied_heating_setpoint: 21 }),
		);
		await broker.handle(
			config,
			"zigbee2mqtt/Dryer",
			JSON.stringify({ state: "OFF" }),
		);
		broker.flush();
		expect(devices.valve(byName("Dryer"), 20)).rejects.toThrow(
			"not a radiator valve",
		);
		expect(devices.switchPower(byName("Linky"), true)).rejects.toThrow(
			"not a switch",
		);
		expect(devices.valve(byName("Bedroom radiator"), 20)).rejects.toThrow(
			"Connect the MQTT broker first.",
		);
		setSetting("mqtt", config);
		await devices.valve(byName("Bedroom radiator"), 50);
		expect(published.at(-1)).toEqual({
			topic: "zigbee2mqtt/Bedroom radiator/set",
			payload: JSON.stringify({ occupied_heating_setpoint: 35 }),
		});
		expect(byName("Bedroom radiator").state).toMatchObject({ target: 35 });
		await jobHandlers["broker.connect"]({});
		await Bun.sleep(5);
		expect(subscribed).toEqual([
			["zigbee2mqtt/#", "+/status/+", "frigate/events"],
		]);
		await devices.switchPower(byName("Dryer"), true);
		expect(published.at(-1)?.payload).toBe(JSON.stringify({ state: "ON" }));
		expect(byName("Dryer").state).toMatchObject({ on: true });
		await devices.refresh(byName("Dryer"));
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
	});
});
