export const coverActions = ["open", "close", "stop"] as const;
export type CoverAction = (typeof coverActions)[number];

export const climateModes = ["heat", "dry", "cool", "fan", "auto"] as const;
export type ClimateMode = (typeof climateModes)[number];

export const tuyaProtocolVersions = ["3.1", "3.3", "3.4", "3.5"] as const;

export interface CoverState {
	type: "cover";
	position: number | null;
}

export interface HotWater {
	boost: boolean;
	temperature: number | null;
	target: number | null;
}

export interface ClimateState {
	type: "climate";
	power: boolean;
	mode: ClimateMode | null;
	modes: ClimateMode[];
	targetTemperature: number | null;
	roomTemperature: number | null;
	minTemperature: number;
	maxTemperature: number;
	offline: boolean;
	hotWater?: HotWater | null;
}

export const printerStages = [
	"idle",
	"preparing",
	"printing",
	"paused",
	"finished",
	"failed",
] as const;
export type PrinterStage = (typeof printerStages)[number];

export const printerSpeeds = [1, 2, 3, 4] as const;
export type PrinterSpeed = (typeof printerSpeeds)[number];

export const printerCommands = ["pause", "resume", "stop"] as const;
export type PrinterCommand = (typeof printerCommands)[number];

export interface Heater {
	temperature: number | null;
	target: number | null;
}

export interface PrinterState {
	type: "printer";
	stage: PrinterStage;
	progress: number | null;
	remainingMinutes: number | null;
	fileName: string | null;
	layer: number | null;
	totalLayers: number | null;
	nozzle: Heater;
	bed: Heater;
	light: boolean | null;
	speed: PrinterSpeed | null;
}

export interface PrinterChange {
	command?: PrinterCommand;
	light?: boolean;
	speed?: PrinterSpeed;
}

export type DeviceState = CoverState | ClimateState | PrinterState;

export interface ClimateChange {
	power?: boolean;
	mode?: ClimateMode;
	targetTemperature?: number;
	hotWaterBoost?: boolean;
}

export type CoverMove = { action: CoverAction } | { position: number };

export const climateModeLabels: Record<ClimateMode, string> = {
	heat: "Heat",
	dry: "Dry",
	cool: "Cool",
	fan: "Fan",
	auto: "Auto",
};

export const printerStageLabels: Record<PrinterStage, string> = {
	idle: "Idle",
	preparing: "Preparing",
	printing: "Printing",
	paused: "Paused",
	finished: "Finished",
	failed: "Failed",
};

export const printerSpeedLabels: Record<PrinterSpeed, string> = {
	1: "Silent",
	2: "Standard",
	3: "Sport",
	4: "Ludicrous",
};

/** A print's time left in words ("2 h 05 min", "12 min"). */
export function timeLeft(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return hours > 0
		? `${hours} h ${String(rest).padStart(2, "0")} min`
		: `${rest} min`;
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** How long ago `readAt` was, in words ("just now", "3 minutes ago"), or `null` when the device was never read. */
export function readAgo(readAt: Date | null, now = Date.now()): string | null {
	if (!readAt) {
		return null;
	}
	const seconds = Math.round((now - readAt.getTime()) / 1000);
	if (seconds < 45) {
		return "just now";
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return relativeTime.format(-minutes, "minute");
	}
	const hours = Math.round(minutes / 60);
	return hours < 24
		? relativeTime.format(-hours, "hour")
		: relativeTime.format(-Math.round(hours / 24), "day");
}
