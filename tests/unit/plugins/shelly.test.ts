import { describe, expect, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { broker } from "#lib/server/devices/broker.js";
import { devices } from "#lib/server/devices/devices.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { shelly } from "#plugins/shelly/readings.js";

import { homeId, resetDatabase } from "../database.js";
import { hosted, pluginOf } from "./support.js";

const plugin = pluginOf<{
	handle(context: unknown, topic: string, payload: Buffer): void;
	flush(context: unknown): void;
}>("shelly");
const context = hosted("shelly").context;

describe("Shelly", () => {
	test("reads relays, single meters and three-phase meters", () => {
		expect(
			shelly.readings("switch:0", { apower: 12.5, aenergy: { total: 1500 } }),
		).toEqual([{ channel: "switch:0", power: 12.5, energy: 1.5 }]);
		expect(shelly.readings("em1:1", { act_power: 900 })).toEqual([
			{ channel: "em1:1", power: 900 },
		]);
		expect(shelly.readings("em1data:1", { total_act_energy: 2000 })).toEqual([
			{ channel: "em1:1", energy: 2 },
		]);
		expect(
			shelly.readings("em:0", {
				a_act_power: 1,
				b_act_power: 2,
				c_act_power: 3,
			}),
		).toHaveLength(3);
		expect(
			shelly.readings("emdata:0", { a_total_act_energy: 1000 })[0],
		).toEqual({
			channel: "em:0:a",
			energy: 1,
		});
		expect(shelly.readings("sys", {})).toEqual([]);
		expect(shelly.readings("input:0", {})).toEqual([]);
	});

	test("the broker brings each channel in as a meter", async () => {
		resetDatabase();
		const handle = (topic: string, payload: string) =>
			plugin.handle(context, topic, Buffer.from(payload));
		handle("shellyem-1/status/em1:0", JSON.stringify({ act_power: 2400 }));
		handle(
			"shellyem-1/status/em1data:0",
			JSON.stringify({ total_act_energy: 5000 }),
		);
		handle("shellyem-1/events/rpc", "{}");
		handle("shellyem-1/status/em1:0", "nope");
		handle("shellyem-1/status/em1:0", "3");
		plugin.flush(context);
		const [device] = DeviceDTO.inHome(homeId());
		expect(device?.kind).toBe("shelly-meter");
		expect(device?.externalId).toBe("shellyem-1/em1:0");
		expect(device?.state).toEqual({ type: "meter", power: 2400, energy: 5 });
		await devices.refresh(DeviceDTO.inHome(homeId())[0] as DeviceDTO);
		await plugins.start("shelly");
		broker.dispatch(
			"shellyplug-2/status/switch:0",
			Buffer.from(JSON.stringify({ apower: 5 })),
		);
		await Bun.sleep(1);
		expect(
			DeviceDTO.inHome(homeId()).some(
				(entry) => entry.externalId === "shellyplug-2/switch:0",
			),
		).toBe(true);
		await plugins.stop("shelly");
	});
});
