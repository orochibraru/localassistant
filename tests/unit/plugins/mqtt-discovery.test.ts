import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { DeviceState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { setPluginSettings, setSetting } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { broker } from "#lib/server/devices/broker.js";
import { devices } from "#lib/server/devices/devices.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { discovery } from "#plugins/mqtt-discovery/discovery.js";

import { homeId, resetDatabase } from "../database.js";
import { hosted, pluginOf } from "./support.js";

const plugin = pluginOf<{
	announce(
		context: unknown,
		prefix: string,
		topic: string,
		payload: Buffer,
	): void;
	receive(context: unknown, topic: string, payload: Buffer): void;
	flush(context: unknown): void;
	apply(
		previous: DeviceState,
		role: string,
		value: unknown,
		config: Record<string, unknown>,
	): DeviceState;
}>("mqtt-discovery");
const context = hosted("mqtt-discovery").context;

const announce = (topic: string, config: unknown) =>
	plugin.announce(
		context,
		"homeassistant",
		`homeassistant/${topic}/config`,
		Buffer.from(typeof config === "string" ? config : JSON.stringify(config)),
	);
const report = (topic: string, payload: string) =>
	plugin.receive(context, topic, Buffer.from(payload));
const named = (name: string) =>
	DeviceDTO.all().find((device) => device.name === name) as DeviceDTO;

const tasmotaPlug = {
	name: "Plug",
	"~": "tasmota/kettle/",
	stat_t: "~stat/POWER",
	cmd_t: "~cmnd/POWER",
	pl_on: "ON",
	pl_off: "OFF",
	uniq_id: "kettle_relay",
	dev: { name: "Kettle" },
};

beforeEach(async () => {
	resetDatabase();
	await plugins.stop("mqtt-discovery");
	setPluginSettings("mqtt-discovery", {
		homeId: homeId(),
		values: { prefix: "homeassistant" },
		secrets: {},
	});
});

describe("Home Assistant's discovery format", () => {
	test("spells out abbreviations and base topics", () => {
		expect(discovery.normalize(tasmotaPlug)).toMatchObject({
			name: "Plug",
			state_topic: "tasmota/kettle/stat/POWER",
			command_topic: "tasmota/kettle/cmnd/POWER",
			unique_id: "kettle_relay",
			device: { name: "Kettle" },
		});
		expect(
			discovery.normalize({ "~": "base", stat_t: "state/~", cmd_t: "plain" }),
		).toMatchObject({ state_topic: "state/base", command_topic: "plain" });
	});

	test("reads the templates devices use and refuses the rest", () => {
		const payload = JSON.stringify({
			ENERGY: { Power: 42 },
			list: [7],
			"a-b": 1,
		});
		expect(discovery.render(null, "ON")).toBe("ON");
		expect(discovery.render("{{ value }}", "ON")).toBe("ON");
		expect(discovery.render("{{ value_json.ENERGY.Power }}", payload)).toBe(42);
		expect(
			discovery.render("{{ value_json['ENERGY'] ['Power'] | float }}", payload),
		).toBe(42);
		expect(discovery.render('{{ value_json["list"][0] }}', payload)).toBe(7);
		expect(discovery.render("{{ value_json.a-b }}", payload)).toBe(1);
		expect(
			discovery.render("{{ value_json.ENERGY.Power.x }}", payload),
		).toBeUndefined();
		expect(discovery.render("{{ value_json.x }}", "not json")).toBeUndefined();
		expect(
			discovery.render("{% if value %}on{% endif %}", "1"),
		).toBeUndefined();
	});

	test("knows which components it can show", () => {
		const entity = (component: string, config: Record<string, unknown>) =>
			discovery.entity(component, "node/object", config)?.kind ?? null;
		expect(entity("light", { cmd_t: "a" })).toBe("mqtt-discovery-switch");
		expect(entity("switch", {})).toBeNull();
		expect(entity("cover", { set_pos_t: "a" })).toBe("mqtt-discovery-cover");
		expect(entity("binary_sensor", { dev_cla: "window" })).toBe(
			"mqtt-discovery-contact",
		);
		expect(entity("binary_sensor", { dev_cla: "motion" })).toBeNull();
		expect(entity("sensor", { unit_of_meas: "kW" })).toBe(
			"mqtt-discovery-power",
		);
		expect(entity("sensor", { dev_cla: "energy" })).toBe(
			"mqtt-discovery-energy",
		);
		expect(entity("sensor", { dev_cla: "temperature" })).toBeNull();
		expect(entity("climate", {})).toBe("mqtt-discovery-climate");
		expect(entity("fan", {})).toBeNull();
		expect(
			discovery.entity("sensor", "node/object", { unit_of_meas: "W" }),
		).toMatchObject({
			externalId: "sensor/node/object",
			name: "node object",
		});
		expect(discovery.subscriptions("mqtt-discovery-other", {})).toEqual([]);
	});
});

describe("MQTT discovery", () => {
	test("brings a Tasmota plug in, follows its state and turns it on and off", async () => {
		announce("switch/kettle/relay", tasmotaPlug);
		announce("switch/kettle/relay", tasmotaPlug);
		announce("switch/kettle/broken", "not json");
		announce("switch/kettle/array", [1]);
		announce("sensor/kettle/temperature", {
			dev_cla: "temperature",
			stat_t: "t",
		});
		expect(DeviceDTO.inHome(homeId())).toHaveLength(1);
		const plug = named("Kettle Plug");
		expect(plug.kind).toBe("mqtt-discovery-switch");
		expect(plug.state).toEqual({
			type: "switch",
			on: null,
			power: null,
			energy: null,
		});
		report("tasmota/kettle/stat/POWER", "ON");
		report("tasmota/kettle/stat/POWER", "garbled");
		plugin.flush(context);
		expect(named("Kettle Plug").state).toMatchObject({ on: true });

		const publish = spyOn(broker, "publish").mockResolvedValue();
		await devices.command(named("Kettle Plug"), { type: "switch", on: false });
		expect(publish).toHaveBeenLastCalledWith(
			"tasmota/kettle/cmnd/POWER",
			"OFF",
		);
		expect(named("Kettle Plug").state).toMatchObject({ on: false });
		await expect(
			devices.command(named("Kettle Plug"), {
				type: "cover",
				move: { action: "open" },
			}),
		).rejects.toThrow("not a cover");
		publish.mockRestore();
	});

	test("reads JSON lights, door sensors, meters, covers and thermostats", async () => {
		announce("light/desk/lamp", {
			name: "Lamp",
			schema: "json",
			stat_t: "zigbee2mqtt/desk",
			cmd_t: "zigbee2mqtt/desk/set",
			uniq_id: "desk_lamp",
		});
		announce("binary_sensor/front/door", {
			name: "Front door",
			dev_cla: "door",
			stat_t: "zigbee2mqtt/front",
			val_tpl: "{{ value_json.contact }}",
			pl_on: "false",
			uniq_id: "front_door",
		});
		announce("sensor/meter/power", {
			name: "Power",
			unit_of_meas: "kW",
			stat_t: "shellies/em/power",
			uniq_id: "em_power",
		});
		announce("sensor/meter/energy", {
			name: "Energy",
			dev_cla: "energy",
			unit_of_meas: "Wh",
			stat_t: "shellies/em/energy",
			uniq_id: "em_energy",
		});
		announce("cover/living/blind", {
			name: "Blind",
			cmd_t: "blind/set",
			pos_t: "blind/position",
			set_pos_t: "blind/position/set",
			pos_open: 255,
			pos_clsd: 0,
			uniq_id: "living_blind",
		});
		announce("cover/garage/door", {
			name: "Garage",
			cmd_t: "garage/set",
			stat_t: "garage/state",
			pl_open: "UP",
			uniq_id: "garage",
		});
		announce("climate/office/thermostat", {
			name: "Office",
			modes: ["off", "heat", "cool", "heat_cool", "fan_only"],
			mode_stat_t: "office/mode",
			mode_cmd_t: "office/mode/set",
			temp_stat_t: "office/target",
			temp_cmd_t: "office/target/set",
			curr_temp_t: "office/current",
			min_temp: 10,
			max_temp: 30,
			uniq_id: "office_climate",
		});
		expect(named("Office").state).toMatchObject({
			modes: ["heat", "cool", "auto", "fan"],
			minTemperature: 10,
			maxTemperature: 30,
		});

		report("zigbee2mqtt/desk", JSON.stringify({ state: "ON", brightness: 40 }));
		report("zigbee2mqtt/front", JSON.stringify({ contact: false }));
		expect(named("Front door").state).toMatchObject({ open: true });
		report("shellies/em/power", "1.5");
		report("shellies/em/power", "n/a");
		report("shellies/em/energy", "2500");
		report("blind/position", "51");
		report("garage/state", "open");
		report("office/mode", "cool");
		report("office/target", "21.5");
		report("office/current", "23");
		plugin.flush(context);
		expect(named("Lamp").state).toMatchObject({ on: true });
		expect(named("Power").state).toMatchObject({ power: 1500 });
		expect(named("Energy").state).toMatchObject({ energy: 2.5 });
		expect(named("Blind").state).toEqual({ type: "cover", position: 20 });
		expect(named("Garage").state).toEqual({ type: "cover", position: 100 });
		report("garage/state", "closed");
		report("garage/state", "opening");
		plugin.flush(context);
		expect(named("Garage").state).toEqual({ type: "cover", position: 0 });
		expect(named("Office").state).toMatchObject({
			power: true,
			mode: "cool",
			targetTemperature: 21.5,
			roomTemperature: 23,
		});
		report("office/mode", "off");
		plugin.flush(context);
		expect(named("Office").state).toMatchObject({ power: false, mode: "cool" });

		const publish = spyOn(broker, "publish").mockResolvedValue();
		await devices.command(named("Lamp"), { type: "switch", on: false });
		expect(publish).toHaveBeenLastCalledWith("zigbee2mqtt/desk/set", {
			state: "OFF",
		});
		await devices.command(named("Blind"), {
			type: "cover",
			move: { position: 50 },
		});
		expect(publish).toHaveBeenLastCalledWith("blind/position/set", "128");
		expect(named("Blind").state).toMatchObject({ position: 50 });
		await devices.command(named("Garage"), {
			type: "cover",
			move: { action: "open" },
		});
		expect(publish).toHaveBeenLastCalledWith("garage/set", "UP");
		await devices.command(named("Garage"), {
			type: "cover",
			move: { position: 10 },
		});
		expect(publish).toHaveBeenLastCalledWith("garage/set", "CLOSE");
		await devices.command(named("Office"), {
			type: "climate",
			change: { power: true, mode: "auto", targetTemperature: 20 },
		});
		expect(publish.mock.calls.slice(-2)).toEqual([
			["office/mode/set", "heat_cool"],
			["office/target/set", "20"],
		]);
		expect(named("Office").state).toMatchObject({
			power: true,
			mode: "auto",
			targetTemperature: 20,
		});
		await devices.command(named("Office"), {
			type: "climate",
			change: { power: false },
		});
		expect(publish).toHaveBeenLastCalledWith("office/mode/set", "off");
		publish.mockRestore();
	});

	test("a thermostat without command topics says so", async () => {
		announce("climate/hall/thermostat", { name: "Hall", uniq_id: "hall" });
		await expect(
			devices.command(named("Hall"), {
				type: "climate",
				change: { mode: "heat" },
			}),
		).rejects.toThrow("takes no mode");
		await expect(
			devices.command(named("Hall"), {
				type: "climate",
				change: { targetTemperature: 19 },
			}),
		).rejects.toThrow("takes no target temperature");
		expect(
			plugin.apply(
				{ type: "linky", day: null, kilowattHours: null },
				"power",
				1,
				{},
			),
		).toEqual({ type: "linky", day: null, kilowattHours: null });
	});

	test("starts on the broker, refuses to connect without one and follows known devices again", async () => {
		setSetting("mqtt", null);
		await expect(plugin.connect?.({}, context)).rejects.toThrow(
			"Connect the MQTT broker first.",
		);
		setSetting("mqtt", {
			url: "mqtt://broker.local",
			username: null,
			encryptedPassword: secrets.encrypt("x"),
			homeId: homeId(),
		});
		await plugin.connect?.({}, context);
		announce("switch/kettle/relay", tasmotaPlug);
		const subscribe = spyOn(broker, "subscribe");
		await plugins.restart("mqtt-discovery");
		expect(subscribe.mock.calls.map((call) => call[1])).toEqual([
			"homeassistant/+/+/config",
			"homeassistant/+/+/+/config",
			"tasmota/kettle/stat/POWER",
		]);
		broker.dispatch(
			"homeassistant/switch/heater/relay/config",
			Buffer.from(
				JSON.stringify({
					...tasmotaPlug,
					uniq_id: "heater",
					dev: { name: "Heater" },
				}),
			),
		);
		await Bun.sleep(5);
		expect(named("Heater Plug")).toBeDefined();
		broker.dispatch("tasmota/kettle/stat/POWER", Buffer.from("ON"));
		await Bun.sleep(5);
		plugin.flush(context);
		expect(named("Kettle Plug").state).toMatchObject({ on: true });
		await plugins.stop("mqtt-discovery");
		setPluginSettings("mqtt-discovery", null);
		await plugins.restart("mqtt-discovery");
		subscribe.mockRestore();
	});
});
