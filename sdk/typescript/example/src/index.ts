import {
	definePlugin,
	type DeviceCommand,
	type FoundDevice,
	type PluginDevice,
	type PluginValues,
	type SwitchState,
} from "../../localassistant-plugin.js";

/** Asks the plug at `device.host` to run a Tasmota command and returns whether it's on. */
async function power(
	device: PluginDevice,
	command: string,
): Promise<SwitchState> {
	if (!device.host) {
		throw new Error("This plug has no address.");
	}
	let response: Response;
	try {
		response = await fetch(
			`http://${device.host}/cm?cmnd=${encodeURIComponent(command)}`,
			{ signal: AbortSignal.timeout(10_000) },
		);
	} catch (error) {
		throw new Error("The plug can't be reached: check its address.", {
			cause: error,
		});
	}
	const answer = (await response.json()) as { POWER?: string };
	return {
		type: "switch",
		on: answer.POWER === "ON",
		power: null,
		energy: null,
	};
}

export default definePlugin({
	add(values: PluginValues): FoundDevice {
		return {
			kind: "tasmota-ts-plug",
			externalId: String(values.host),
			host: String(values.host),
		};
	},
	read(device) {
		return power(device, "Power");
	},
	command(device, command: DeviceCommand) {
		if (command.type !== "switch") {
			return Promise.reject(new Error("A plug only turns on and off."));
		}
		return power(device, command.on ? "Power On" : "Power Off");
	},
});
