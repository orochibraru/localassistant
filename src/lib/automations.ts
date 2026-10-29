import type {
	ClimateMode,
	PrinterCommand,
	VacuumCommand,
} from "#lib/devices.js";
import type { PluginCard } from "#lib/plugins.js";

export const sunEvents = ["sunrise", "sunset"] as const;
export type SunEvent = (typeof sunEvents)[number];

export const weekdays = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
] as const;

export const seasons = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof seasons)[number];

export const thresholdDirections = ["above", "below"] as const;
export type ThresholdDirection = (typeof thresholdDirections)[number];

export const blindMoves = ["open", "close", "position"] as const;
export type BlindMove = (typeof blindMoves)[number];

export const presetKeys = [
	"blinds-sunset",
	"blinds-sunrise",
	"blinds-heat",
	"window-valves",
	"door-heating",
] as const;
export type PresetKey = (typeof presetKeys)[number];

export const presets: Record<
	PresetKey,
	{
		title: string;
		build: (
			devices: { id: string; card: PluginCard; roomId?: string | null }[],
		) => {
			name: string;
			trigger: Trigger;
			period: Period;
			actions: AutomationAction[];
		};
	}
> = {
	"blinds-sunset": {
		title: "Close the blinds at sunset, autumn and winter",
		build: () => ({
			name: "Close the blinds at sunset",
			trigger: { type: "sun", event: "sunset", offsetMinutes: 0 },
			period: { type: "seasons", seasons: ["autumn", "winter"] },
			actions: [
				{ type: "blinds", roomId: null, move: "close", position: null },
			],
		}),
	},
	"blinds-sunrise": {
		title: "Open the blinds at sunrise, autumn and winter",
		build: () => ({
			name: "Open the blinds at sunrise",
			trigger: { type: "sun", event: "sunrise", offsetMinutes: 0 },
			period: { type: "seasons", seasons: ["autumn", "winter"] },
			actions: [{ type: "blinds", roomId: null, move: "open", position: null }],
		}),
	},
	"blinds-heat": {
		title: "Close the blinds when it gets hot, summer",
		build: () => ({
			name: "Keep the heat out",
			trigger: { type: "temperature", direction: "above", threshold: 28 },
			period: { type: "seasons", seasons: ["summer"] },
			actions: [
				{ type: "blinds", roomId: null, move: "close", position: null },
			],
		}),
	},
	"window-valves": {
		title: "Radiators off while a window is open",
		build: (devices) => {
			const ofCard = (card: PluginCard) =>
				devices
					.filter((device) => device.card === card)
					.map((device) => device.id);
			return {
				name: "Radiators off while a window is open",
				trigger: { type: "contact", deviceIds: ofCard("contact") },
				period: { type: "always" },
				actions: [{ type: "valves", deviceIds: ofCard("valve") }],
			};
		},
	},
	"door-heating": {
		title: "Heating down while the front door is open",
		build: (devices) => {
			const sensors = devices.filter((device) => device.card === "contact");
			const doors = sensors.filter((device) => device.roomId === null);
			return {
				name: "Heating down while the front door is open",
				trigger: {
					type: "contact",
					deviceIds: (doors.length > 0 ? doors : sensors).map(
						(device) => device.id,
					),
				},
				period: { type: "seasons", seasons: ["autumn", "winter"] },
				actions: [
					{
						type: "heating",
						deviceIds: devices
							.filter(
								(device) =>
									device.card === "climate" || device.card === "valve",
							)
							.map((device) => device.id),
						degrees: 3,
					},
				],
			};
		},
	},
};
export type Trigger =
	| { type: "sun"; event: SunEvent; offsetMinutes: number }
	| { type: "time"; time: string; weekdays: number[] }
	| {
			type: "temperature";
			direction: ThresholdDirection;
			threshold: number;
	  }
	| { type: "contact"; deviceIds: string[] };

export type Period =
	| { type: "always" }
	| { type: "seasons"; seasons: Season[] }
	| { type: "dates"; from: string; to: string };

export type AutomationAction =
	| {
			type: "blinds";
			roomId: string | null;
			move: BlindMove;
			position: number | null;
	  }
	| {
			type: "climate";
			deviceId: string;
			power: boolean;
			mode: ClimateMode | null;
			targetTemperature: number | null;
	  }
	| { type: "printer"; deviceId: string; command: PrinterCommand }
	| { type: "vacuum"; deviceId: string; command: VacuumCommand }
	| { type: "valves"; deviceIds: string[] }
	| { type: "heating"; deviceIds: string[]; degrees: number };

const seasonMonths: Record<Season, number[]> = {
	spring: [3, 4, 5],
	summer: [6, 7, 8],
	autumn: [9, 10, 11],
	winter: [12, 1, 2],
};

/** The season a month (1 to 12) falls in, meteorologically: winter is December to February. */
export function seasonOf(month: number): Season {
	return (
		seasons.find((season) => seasonMonths[season].includes(month)) ?? "winter"
	);
}

/** Whether `monthDay` ("MM-DD") falls between `from` and `to`, both included, wrapping over New Year. */
export function withinDates(
	monthDay: string,
	from: string,
	to: string,
): boolean {
	return from <= to
		? monthDay >= from && monthDay <= to
		: monthDay >= from || monthDay <= to;
}

/** Whether `period` covers the local date `monthDay` ("MM-DD"). */
export function inPeriod(period: Period, monthDay: string): boolean {
	if (period.type === "always") {
		return true;
	}
	if (period.type === "seasons") {
		return period.seasons.includes(seasonOf(Number(monthDay.slice(0, 2))));
	}
	return withinDates(monthDay, period.from, period.to);
}

/** A trigger in words: "At sunset, 15 min after", "At 21:00 on weekdays", "When it gets above 28°C outside", "When one of 2 doors or windows opens". */
export function describeTrigger(trigger: Trigger): string {
	if (trigger.type === "sun") {
		const offset = Math.abs(trigger.offsetMinutes);
		if (offset === 0) {
			return `At ${trigger.event}`;
		}
		return `${offset} min ${trigger.offsetMinutes < 0 ? "before" : "after"} ${trigger.event}`;
	}
	if (trigger.type === "time") {
		return `At ${trigger.time} ${describeWeekdays(trigger.weekdays)}`;
	}
	if (trigger.type === "contact") {
		return trigger.deviceIds.length === 1
			? "When a door or window opens"
			: `When one of ${trigger.deviceIds.length} doors or windows opens`;
	}
	return `When it gets ${trigger.direction} ${trigger.threshold}°C outside`;
}

/** Chosen weekdays (0 is Monday) in words: "every day", "on weekdays", "on Mon, Wed". */
export function describeWeekdays(days: number[]): string {
	const sorted = [...new Set(days)].toSorted((first, second) => first - second);
	if (sorted.length === 7) {
		return "every day";
	}
	if (sorted.join() === "0,1,2,3,4") {
		return "on weekdays";
	}
	if (sorted.join() === "5,6") {
		return "at weekends";
	}
	return `on ${sorted.map((day) => weekdays[day]?.slice(0, 3)).join(", ")}`;
}

/** A period in words: "All year", "In summer", "From 15/06 to 31/08". */
export function describePeriod(period: Period): string {
	if (period.type === "always") {
		return "All year";
	}
	if (period.type === "seasons") {
		return `In ${period.seasons.join(" and ")}`;
	}
	const day = (monthDay: string) =>
		`${monthDay.slice(3)}/${monthDay.slice(0, 2)}`;
	return `From ${day(period.from)} to ${day(period.to)}`;
}

const commandWords: Record<PrinterCommand | VacuumCommand, string> = {
	pause: "Pause",
	resume: "Resume",
	stop: "Stop",
	start: "Start",
	dock: "Dock",
};

/** A step in words, with the device and room names it points at: "Close every blind", "Heat Living room to 20°C". */
export function describeAction(
	action: AutomationAction,
	names: { devices: Map<string, string>; rooms: Map<string, string> },
): string {
	if (action.type === "blinds") {
		const where =
			action.roomId === null
				? "every blind"
				: `the blinds in ${names.rooms.get(action.roomId) ?? "a removed room"}`;
		if (action.move === "position") {
			return `Move ${where} to ${action.position ?? 50}% open`;
		}
		return `${action.move === "open" ? "Open" : "Close"} ${where}`;
	}
	if (action.type === "heating") {
		return `Turn ${action.deviceIds.length} ${action.deviceIds.length === 1 ? "heater" : "heaters"} down by ${action.degrees}°C until it shuts`;
	}
	if (action.type === "valves") {
		return `Close ${action.deviceIds.length} radiator ${action.deviceIds.length === 1 ? "valve" : "valves"} in its room until it shuts`;
	}
	const device = names.devices.get(action.deviceId) ?? "a removed device";
	if (action.type === "climate") {
		if (!action.power) {
			return `Turn ${device} off`;
		}
		const mode = action.mode ? ` in ${action.mode} mode` : "";
		const target =
			action.targetTemperature === null
				? ""
				: ` at ${action.targetTemperature}°C`;
		return `Turn ${device} on${mode}${target}`;
	}
	return `${commandWords[action.command]} ${device}`;
}
