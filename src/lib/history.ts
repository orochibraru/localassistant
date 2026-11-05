import type {
	ButtonState,
	DeviceState,
	LockState,
	MediaState,
	PresenceState,
	PrinterState,
	VacuumState,
} from "#lib/devices.js";

export interface HistoryPoint {
	at: Date;
	value: number;
}

export interface LogbookLine {
	id: number;
	deviceId: string | null;
	name: string;
	message: string;
	at: Date;
}

export const historyRanges = ["day", "week"] as const;
export type HistoryRange = (typeof historyRanges)[number];

export const historyRangeHours: Record<HistoryRange, number> = {
	day: 24,
	week: 24 * 7,
};

const onWords = (on: boolean) => (on ? "turned on" : "turned off");

function switched(
	previous: boolean | null | undefined,
	next: boolean | null,
	words: (value: boolean) => string,
): string | null {
	return next === null || previous === undefined || previous === next
		? null
		: words(next);
}

function lockChange(
	previous: DeviceState | null,
	next: LockState,
): string | null {
	const before = previous?.type === "lock" ? previous : null;
	if (next.jammed && before && !before.jammed) {
		return "is jammed";
	}
	return switched(before?.locked, next.locked, (locked) =>
		locked ? "locked" : "unlocked",
	);
}

function mediaChange(
	previous: DeviceState | null,
	next: MediaState,
): string | null {
	const before = previous?.type === "media" ? previous : null;
	if (!before || before.playback === next.playback) {
		return switched(before?.power, next.power, onWords);
	}
	return next.playback === "playing"
		? "started playing"
		: next.playback === "paused"
			? "paused"
			: "stopped";
}

function buttonChange(
	previous: DeviceState | null,
	next: ButtonState,
): string | null {
	return next.pressedAt &&
		previous?.type === "button" &&
		previous.pressedAt !== next.pressedAt
		? "was pressed"
		: null;
}

function presenceChange(
	previous: DeviceState | null,
	next: PresenceState,
): string | null {
	if (previous?.type !== "presence") {
		return null;
	}
	if (next.zone && next.zone !== previous.zone) {
		return `is in ${next.zone}`;
	}
	return switched(previous.home, next.home, (home) =>
		home ? "got home" : "left",
	);
}

function stageChange(
	previous: DeviceState | null,
	next: VacuumState | PrinterState,
): string | null {
	return previous?.type === next.type &&
		"stage" in previous &&
		previous.stage !== next.stage
		? `is ${next.stage}`
		: null;
}

/**
 * What changed between two states of a device, in words to follow its name: "turned on", "opened", "locked", "got
 * home", "is in Work", "started playing", "was pressed"; `null` when nothing worth a logbook line changed.
 */
export function describeChange(
	previous: DeviceState | null,
	next: DeviceState,
): string | null {
	const before = previous?.type === next.type ? previous : null;
	switch (next.type) {
		case "switch":
		case "light":
		case "fan":
			return switched(
				before && "on" in before ? before.on : undefined,
				next.on,
				onWords,
			);
		case "climate":
			return switched(
				before?.type === "climate" ? before.power : undefined,
				next.power,
				onWords,
			);
		case "contact":
			return switched(
				before?.type === "contact" ? before.open : undefined,
				next.open,
				(open) => (open ? "opened" : "shut"),
			);
		case "lock":
			return lockChange(previous, next);
		case "media":
			return mediaChange(previous, next);
		case "button":
			return buttonChange(previous, next);
		case "presence":
			return presenceChange(previous, next);
		case "vacuum":
		case "printer":
			return stageChange(previous, next);
		default:
			return null;
	}
}

/** The unit of the number a state's history follows: "W", "°C", "%" or a sensor's own; empty when it has none. */
export function readingUnit(state: DeviceState | null): string {
	switch (state?.type) {
		case "sensor":
			return (
				state.readings.find((entry) => typeof entry.value === "number")?.unit ??
				""
			);
		case "meter":
		case "switch":
			return "W";
		case "climate":
		case "valve":
			return "°C";
		case "light":
		case "fan":
		case "cover":
		case "vacuum":
			return "%";
		default:
			return "";
	}
}

/** `points` averaged into at most `buckets` equal slices of time between `from` and `to`, empty slices left out. */
export function bucketed(
	points: HistoryPoint[],
	from: Date,
	to: Date,
	buckets: number,
): HistoryPoint[] {
	if (points.length <= buckets) {
		return points;
	}
	const width = (to.getTime() - from.getTime()) / buckets;
	const sums = new Map<number, { total: number; count: number }>();
	for (const point of points) {
		const slot = Math.min(
			buckets - 1,
			Math.max(0, Math.floor((point.at.getTime() - from.getTime()) / width)),
		);
		const sum = sums.get(slot) ?? { total: 0, count: 0 };
		sums.set(slot, { total: sum.total + point.value, count: sum.count + 1 });
	}
	return [...sums.entries()]
		.toSorted(([first], [second]) => first - second)
		.map(([slot, sum]) => ({
			at: new Date(from.getTime() + (slot + 0.5) * width),
			value: Math.round((sum.total / sum.count) * 100) / 100,
		}));
}
