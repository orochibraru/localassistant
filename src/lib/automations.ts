import type { DeviceState } from "#lib/devices.js";
import type { DeviceCommand } from "#lib/plugin-sdk.js";
import type { PluginCard } from "#lib/plugins.js";
import type { PresenceEvent } from "#lib/presence.js";

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
			conditions: Condition[];
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
			conditions: [],
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
			conditions: [],
			actions: [{ type: "blinds", roomId: null, move: "open", position: null }],
		}),
	},
	"blinds-heat": {
		title: "Close the blinds when it gets hot, summer",
		build: () => ({
			name: "Keep the heat out",
			trigger: { type: "temperature", direction: "above", threshold: 28 },
			period: { type: "seasons", seasons: ["summer"] },
			conditions: [],
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
				conditions: [],
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
				conditions: [],
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
export const stateChecks = [
	"on",
	"off",
	"open",
	"closed",
	"locked",
	"unlocked",
	"playing",
	"above",
	"below",
	"pressed",
] as const;
export type StateCheck = (typeof stateChecks)[number];

export interface StateTest {
	deviceId: string;
	check: StateCheck;
	value: number | null;
}

export const dayParts = ["day", "night"] as const;
export type DayPart = (typeof dayParts)[number];

export type Condition =
	| { type: "device"; test: StateTest }
	| { type: "time"; from: string; to: string }
	| { type: "weekdays"; weekdays: number[] }
	| { type: "sun"; when: DayPart }
	| { type: "presence"; who: string; home: boolean };

export type Trigger =
	| { type: "sun"; event: SunEvent; offsetMinutes: number }
	| { type: "time"; time: string; weekdays: number[] }
	| {
			type: "temperature";
			direction: ThresholdDirection;
			threshold: number;
	  }
	| { type: "contact"; deviceIds: string[] }
	| { type: "device"; test: StateTest }
	| { type: "presence"; event: PresenceEvent; who: string };

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
	| { type: "device"; deviceId: string; command: DeviceCommand }
	| { type: "scene"; sceneId: string }
	| { type: "delay"; minutes: number }
	| {
			type: "notify";
			who: string;
			title: string;
			body: string;
			sceneIds: string[];
	  }
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

/**
 * A trigger in words: "At sunset, 15 min after", "At 21:00 on weekdays", "When it gets above 28°C outside", "When
 * Hall lamp turns on"; `deviceName` names the device a state trigger watches.
 */
export function describeTrigger(
	trigger: Trigger,
	deviceName: (deviceId: string) => string = () => "a device",
	personName: (userId: string) => string = () => "someone",
): string {
	if (trigger.type === "presence") {
		return `When ${describePresence(trigger.event, trigger.who, personName)}`;
	}
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
	if (trigger.type === "device") {
		return `When ${describeTest(trigger.test, deviceName)}`;
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

const checkWords: Record<StateCheck, string> = {
	on: "turns on",
	off: "turns off",
	open: "opens",
	closed: "shuts",
	locked: "locks",
	unlocked: "unlocks",
	playing: "starts playing",
	above: "goes above",
	below: "goes below",
	pressed: "is pressed",
};

const holdWords: Record<StateCheck, string> = {
	on: "is on",
	off: "is off",
	open: "is open",
	closed: "is shut",
	locked: "is locked",
	unlocked: "is unlocked",
	playing: "is playing",
	above: "is above",
	below: "is below",
	pressed: "was pressed",
};

const cardChecks: Partial<Record<PluginCard, StateCheck[]>> = {
	switch: ["on", "off", "above", "below"],
	light: ["on", "off", "above", "below"],
	fan: ["on", "off", "above", "below"],
	climate: ["on", "off", "above", "below"],
	media: ["on", "off", "playing"],
	contact: ["open", "closed"],
	cover: ["open", "closed", "above", "below"],
	lock: ["locked", "unlocked"],
	meter: ["above", "below"],
	valve: ["above", "below"],
	sensor: ["on", "off", "above", "below"],
	vacuum: ["above", "below"],
	button: ["pressed"],
};

/** The checks a device on `card` can be watched for; empty for one that reports nothing to compare. */
export function checksFor(card: PluginCard): StateCheck[] {
	return cardChecks[card] ?? [];
}

/** Whether `check` compares a number, so it needs a value. */
export function measures(check: StateCheck): boolean {
	return check === "above" || check === "below";
}

/**
 * The number a state is compared on: a sensor's first numeric reading, a meter's or switch's power, a thermostat's room
 * temperature, a valve's temperature, a light's brightness, a fan's speed, a cover's position, a vacuum's battery.
 */
export function readingOf(state: DeviceState): number | null {
	switch (state.type) {
		case "sensor": {
			const reading = state.readings.find(
				(entry) => typeof entry.value === "number",
			);
			return typeof reading?.value === "number" ? reading.value : null;
		}
		case "meter":
		case "switch":
			return state.power;
		case "climate":
			return state.roomTemperature;
		case "valve":
			return state.temperature;
		case "light":
			return state.brightness;
		case "fan":
			return state.speed;
		case "cover":
			return state.position;
		case "vacuum":
			return state.battery;
		default:
			return null;
	}
}

function switchedOn(state: DeviceState): boolean | null {
	switch (state.type) {
		case "switch":
		case "light":
		case "fan":
			return state.on;
		case "climate":
			return state.power;
		case "media":
			return state.power;
		case "sensor": {
			const reading = state.readings.find(
				(entry) => typeof entry.value === "boolean",
			);
			return typeof reading?.value === "boolean" ? reading.value : null;
		}
		default:
			return null;
	}
}

function opened(state: DeviceState): boolean | null {
	if (state.type === "contact") {
		return state.open;
	}
	return state.type === "cover" && state.position !== null
		? state.position > 0
		: null;
}

/** Whether `state` passes `test` right now; "pressed" never holds, it only fires. */
export function testHolds(test: StateTest, state: DeviceState | null): boolean {
	if (!state) {
		return false;
	}
	const reading = readingOf(state);
	switch (test.check) {
		case "on":
			return switchedOn(state) === true;
		case "off":
			return switchedOn(state) === false;
		case "open":
			return opened(state) === true;
		case "closed":
			return opened(state) === false;
		case "locked":
			return state.type === "lock" && state.locked === true;
		case "unlocked":
			return state.type === "lock" && state.locked === false;
		case "playing":
			return state.type === "media" && state.playback === "playing";
		case "above":
			return reading !== null && reading > (test.value ?? 0);
		case "below":
			return reading !== null && reading < (test.value ?? 0);
		default:
			return false;
	}
}

/** Whether going from `previous` to `next` sets `test` off: it didn't hold and now does, or a button was pressed again. */
export function testFires(
	test: StateTest,
	previous: DeviceState | null,
	next: DeviceState,
): boolean {
	if (test.check === "pressed") {
		return (
			next.type === "button" &&
			next.pressedAt !== null &&
			(previous?.type !== "button" || previous.pressedAt !== next.pressedAt)
		);
	}
	return !testHolds(test, previous) && testHolds(test, next);
}

/** A state test in words, as it fires: "Hall lamp turns on", "Office goes above 25". */
export function describeTest(
	test: StateTest,
	deviceName: (deviceId: string) => string,
	holds = false,
): string {
	const words = (holds ? holdWords : checkWords)[test.check];
	return `${deviceName(test.deviceId)} ${words}${measures(test.check) ? ` ${test.value ?? 0}` : ""}`;
}

/** Someone arriving or leaving in words: "someone gets home", "the last person leaves", "Ada leaves". */
export function describePresence(
	event: PresenceEvent,
	who: string,
	personName: (userId: string) => string,
): string {
	const person =
		who === "anyone"
			? "someone"
			: who === "first"
				? "the first person"
				: who === "last"
					? "the last person"
					: personName(who);
	return `${person} ${event === "arrive" ? "gets home" : "leaves"}`;
}

/** Whether `time` ("HH:MM") falls between `from` and `to`, `from` included and `to` excluded, wrapping over midnight. */
export function withinTimes(time: string, from: string, to: string): boolean {
	return from <= to ? time >= from && time < to : time >= from || time < to;
}

/** A condition in words: "Hall lamp is on", "Between 22:00 and 06:00", "On weekdays", "At night". */
export function describeCondition(
	condition: Condition,
	deviceName: (deviceId: string) => string,
	personName: (userId: string) => string = () => "Someone",
): string {
	if (condition.type === "presence") {
		if (condition.who === "anyone") {
			return condition.home ? "Someone is home" : "Nobody is home";
		}
		return `${personName(condition.who)} is ${condition.home ? "home" : "away"}`;
	}
	if (condition.type === "device") {
		return describeTest(condition.test, deviceName, true);
	}
	if (condition.type === "time") {
		return `Between ${condition.from} and ${condition.to}`;
	}
	if (condition.type === "weekdays") {
		const days = describeWeekdays(condition.weekdays);
		return days.charAt(0).toUpperCase() + days.slice(1);
	}
	return condition.when === "day" ? "During the day" : "At night";
}

const commandWords: Record<string, string> = {
	pause: "Pause",
	resume: "Resume",
	stop: "Stop",
	start: "Start",
	dock: "Dock",
	play: "Play",
	next: "Skip to the next track on",
	previous: "Go back a track on",
};

function onOff(
	on: boolean | undefined,
	device: string,
	rest: string[],
): string {
	if (on === false) {
		return `Turn ${device} off`;
	}
	const details = rest.length > 0 ? ` ${rest.join(" ")}` : "";
	return on === true || rest.length === 0
		? `Turn ${device} on${details}`
		: `Set ${device}${details}`;
}

/** A device command in words: "Turn Hall lamp on at 40%", "Lock Front door", "Press Doorbell". */
export function describeCommand(
	command: DeviceCommand,
	device: string,
): string {
	switch (command.type) {
		case "cover":
			return "position" in command.move
				? `Move ${device} to ${command.move.position}% open`
				: `${command.move.action === "stop" ? "Stop" : command.move.action === "open" ? "Open" : "Close"} ${device}`;
		case "climate": {
			const change = command.change;
			return onOff(change.power, device, [
				...(change.mode ? [`in ${change.mode} mode`] : []),
				...(change.targetTemperature === undefined
					? []
					: [`at ${change.targetTemperature}°C`]),
			]);
		}
		case "switch":
			return onOff(command.on, device, []);
		case "valve":
			return `Set ${device} to ${command.target}°C`;
		case "light": {
			const change = command.change;
			return onOff(change.on, device, [
				...(change.brightness === undefined
					? []
					: [`at ${change.brightness}%`]),
				...(change.temperature === undefined
					? []
					: [`${change.temperature} K`]),
				...(change.color ? ["in colour"] : []),
			]);
		}
		case "lock":
			return `${command.locked ? "Lock" : "Unlock"} ${device}`;
		case "fan": {
			const change = command.change;
			return onOff(change.on, device, [
				...(change.speed === undefined ? [] : [`at ${change.speed}%`]),
				...(change.oscillating === undefined
					? []
					: [change.oscillating ? "oscillating" : "still"]),
			]);
		}
		case "media": {
			const change = command.change;
			if (change.action) {
				return `${commandWords[change.action] ?? change.action} ${device}`;
			}
			return onOff(change.power, device, [
				...(change.volume === undefined ? [] : [`at volume ${change.volume}`]),
				...(change.source === undefined ? [] : [`on ${change.source}`]),
			]);
		}
		case "button":
			return `Press ${device}`;
		case "printer":
		case "vacuum": {
			const order = command.change.command;
			return order
				? `${commandWords[order] ?? order} ${device}`
				: `Set ${device}`;
		}
	}
}

/** A step in words, with the device, room and scene names it points at: "Close every blind", "Wait 10 min". */
export function describeAction(
	action: AutomationAction,
	names: {
		devices: Map<string, string>;
		rooms: Map<string, string>;
		scenes?: Map<string, string>;
		people?: Map<string, string>;
	},
): string {
	if (action.type === "notify") {
		const who =
			action.who === "everyone"
				? "everyone"
				: action.who === "admins"
					? "the admins"
					: (names.people?.get(action.who) ?? "a removed account");
		return `Tell ${who} "${action.title}"`;
	}
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
	if (action.type === "delay") {
		return `Wait ${action.minutes} min`;
	}
	if (action.type === "scene") {
		return `Set the scene ${names.scenes?.get(action.sceneId) ?? "that was removed"}`;
	}
	return describeCommand(
		action.command,
		names.devices.get(action.deviceId) ?? "a removed device",
	);
}
