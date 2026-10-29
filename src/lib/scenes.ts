import type { DeviceState } from "#lib/devices.js";
import type { DeviceCommand } from "#lib/plugin-sdk.js";
import type { PluginCard } from "#lib/plugins.js";

export interface SceneMember {
	deviceId: string;
	command: DeviceCommand;
}

/**
 * The command that puts a device back the way `state` shows it, or `null` for one a scene can't set: sensors, meters,
 * cameras, printers, vacuums, buttons and phones.
 */
export function captureCommand(
	state: DeviceState | null,
): DeviceCommand | null {
	switch (state?.type) {
		case "switch":
			return state.on === null ? null : { type: "switch", on: state.on };
		case "light":
			if (state.on === null) {
				return null;
			}
			return {
				type: "light",
				change: state.on
					? {
							on: true,
							...(state.brightness === null
								? {}
								: { brightness: state.brightness }),
							...(state.color
								? { color: state.color }
								: state.temperature === null
									? {}
									: { temperature: state.temperature }),
						}
					: { on: false },
			};
		case "cover":
			return state.position === null
				? null
				: { type: "cover", move: { position: state.position } };
		case "climate":
			return {
				type: "climate",
				change: {
					power: state.power,
					...(state.mode ? { mode: state.mode } : {}),
					...(state.targetTemperature === null
						? {}
						: { targetTemperature: state.targetTemperature }),
				},
			};
		case "valve":
			return state.target === null
				? null
				: { type: "valve", target: state.target };
		case "fan":
			if (state.on === null) {
				return null;
			}
			return {
				type: "fan",
				change: {
					on: state.on,
					...(state.on && state.speed !== null ? { speed: state.speed } : {}),
				},
			};
		case "lock":
			return state.locked === null
				? null
				: { type: "lock", locked: state.locked };
		case "media":
			if (state.power === null) {
				return null;
			}
			return {
				type: "media",
				change: {
					power: state.power,
					...(state.power && state.volume !== null
						? { volume: state.volume }
						: {}),
				},
			};
		default:
			return null;
	}
}

const startingCommands: Partial<Record<PluginCard, DeviceCommand>> = {
	switch: { type: "switch", on: true },
	light: { type: "light", change: { on: true } },
	cover: { type: "cover", move: { action: "close" } },
	climate: { type: "climate", change: { power: true, targetTemperature: 20 } },
	valve: { type: "valve", target: 19 },
	fan: { type: "fan", change: { on: true } },
	lock: { type: "lock", locked: true },
	media: { type: "media", change: { action: "pause" } },
	button: { type: "button" },
	printer: { type: "printer", change: { command: "pause" } },
	vacuum: { type: "vacuum", change: { command: "start" } },
};

/** The command a new step or scene member starts with for a device on `card`, or `null` when it takes none. */
export function startingCommand(card: PluginCard): DeviceCommand | null {
	const command = startingCommands[card];
	return command ? structuredClone(command) : null;
}
