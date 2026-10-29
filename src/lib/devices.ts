export const coverActions = ["open", "close", "stop"] as const;
export type CoverAction = (typeof coverActions)[number];

export const climateModes = ["heat", "dry", "cool", "fan", "auto"] as const;
export type ClimateMode = (typeof climateModes)[number];

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
	camera: string | null;
}

export interface PrinterChange {
	command?: PrinterCommand;
	light?: boolean;
	speed?: PrinterSpeed;
}

export interface AppLocation {
	latitude: number;
	longitude: number;
	accuracy: number | null;
	at: string;
}

export interface AppState {
	type: "app";
	battery: number | null;
	charging: boolean | null;
	location: AppLocation | null;
	platform: string;
}

export const vacuumStages = [
	"cleaning",
	"idle",
	"paused",
	"returning",
	"charging",
	"docked",
	"washing",
	"drying",
	"error",
] as const;
export type VacuumStage = (typeof vacuumStages)[number];

export const vacuumCommands = ["start", "pause", "dock", "stop"] as const;
export type VacuumCommand = (typeof vacuumCommands)[number];

export const vacuumModes = ["vacuum", "mop", "both"] as const;
export type VacuumMode = (typeof vacuumModes)[number];

export const vacuumModeLabels: Record<VacuumMode, string> = {
	vacuum: "Vacuum",
	mop: "Mop",
	both: "Both",
};

export const vacuumSuctions = ["quiet", "standard", "strong", "max"] as const;
export type VacuumSuction = (typeof vacuumSuctions)[number];

export const vacuumSuctionLabels: Record<VacuumSuction, string> = {
	quiet: "Quiet",
	standard: "Standard",
	strong: "Strong",
	max: "Max",
};

export const vacuumWetness = { min: 1, max: 32 } as const;

export interface VacuumChange {
	command?: VacuumCommand;
	mode?: VacuumMode;
	suction?: VacuumSuction;
	wetness?: number;
	cleanGenius?: boolean;
	reset?: VacuumPart;
}

export const vacuumParts = [
	"mainBrush",
	"sideBrush",
	"filter",
	"mopPads",
	"silverIon",
	"detergent",
] as const;
export type VacuumPart = (typeof vacuumParts)[number];
export type VacuumParts = Record<VacuumPart, number | null>;

export const vacuumPartLabels: Record<VacuumPart, string> = {
	mainBrush: "Main brush",
	sideBrush: "Side brush",
	filter: "Filter",
	mopPads: "Mop pads",
	silverIon: "Silver ion",
	detergent: "Detergent",
};

export const dockStatuses = [
	"ok",
	"low",
	"full",
	"missing",
	"check",
	"off",
] as const;
export type DockStatus = (typeof dockStatuses)[number];

export const dockStatusLabels: Record<DockStatus, string> = {
	ok: "OK",
	low: "Low",
	full: "Full or out",
	missing: "Missing",
	check: "Check it",
	off: "Off",
};

export interface VacuumDock {
	cleanWater: DockStatus | null;
	dirtyWater: DockStatus | null;
	dustBag: DockStatus | null;
	detergent: DockStatus | null;
}

export const cardSizes = ["small", "medium", "large"] as const;
export type CardSize = (typeof cardSizes)[number];

export const cardSizeLabels: Record<CardSize, string> = {
	small: "Small",
	medium: "Medium",
	large: "Large",
};

/** `ids` with `moving` taken out and put where `target` was. */
export function moveCard(
	ids: string[],
	moving: string,
	target: string,
): string[] {
	const rest = ids.filter((id) => id !== moving);
	const at = ids.indexOf(target);
	if (at === -1 || !ids.includes(moving)) {
		return ids;
	}
	rest.splice(at, 0, moving);
	return rest;
}

/** The full order with the cards of one section put back in their new order, in the slots that section used. */
export function refill(order: string[], section: string[]): string[] {
	const moved = new Set(section);
	const queue = [...section];
	return order.map((id) => (moved.has(id) ? (queue.shift() ?? id) : id));
}

export interface VacuumState {
	type: "vacuum";
	stage: VacuumStage;
	battery: number | null;
	charging: boolean;
	errorCode: number | null;
	mode: VacuumMode | null;
	suction: VacuumSuction | null;
	wetness: number | null;
	cleanGenius: boolean | null;
	lastCleanMinutes: number | null;
	lastCleanArea: number | null;
	partsLeft: VacuumParts;
	dock: VacuumDock;
}

export interface ContactState {
	type: "contact";
	open: boolean | null;
	battery: number | null;
}

export interface ValveState {
	type: "valve";
	target: number | null;
	temperature: number | null;
	battery: number | null;
	setpoint: string;
	min: number;
	max: number;
	heldBy: string | null;
	heldTarget: number | null;
}

export interface SwitchState {
	type: "switch";
	on: boolean | null;
	power: number | null;
	energy: number | null;
}

export interface MeterState {
	type: "meter";
	power: number | null;
	energy: number | null;
}

export interface LinkyState {
	type: "linky";
	day: string | null;
	kilowattHours: number | null;
}

export interface CameraLive {
	format: "hls" | "image";
	path: string;
}

export interface CameraState {
	type: "camera";
	streaming: boolean;
	recording: boolean;
	lastRecordingAt: string | null;
	source: string | null;
	live: CameraLive | null;
	snapshot: string | null;
}

export const lightFeatures = ["brightness", "temperature", "color"] as const;
export type LightFeature = (typeof lightFeatures)[number];

export interface LightColor {
	hue: number;
	saturation: number;
}

export interface LightState {
	type: "light";
	on: boolean | null;
	brightness: number | null;
	temperature: number | null;
	minTemperature: number;
	maxTemperature: number;
	color: LightColor | null;
	features: LightFeature[];
}

export interface LightChange {
	on?: boolean;
	brightness?: number;
	temperature?: number;
	color?: LightColor;
}

export interface LockState {
	type: "lock";
	locked: boolean | null;
	jammed: boolean;
	battery: number | null;
}

export interface FanState {
	type: "fan";
	on: boolean | null;
	speed: number | null;
	speedSteps: number;
	oscillating: boolean | null;
}

export interface FanChange {
	on?: boolean;
	speed?: number;
	oscillating?: boolean;
}

export const mediaActions = [
	"play",
	"pause",
	"next",
	"previous",
	"stop",
] as const;
export type MediaAction = (typeof mediaActions)[number];

export const mediaPlaybacks = ["playing", "paused", "idle"] as const;
export type MediaPlayback = (typeof mediaPlaybacks)[number];

export interface MediaState {
	type: "media";
	power: boolean | null;
	playback: MediaPlayback | null;
	title: string | null;
	artist: string | null;
	volume: number | null;
	muted: boolean | null;
	source: string | null;
	sources: string[];
}

export interface MediaChange {
	power?: boolean;
	action?: MediaAction;
	volume?: number;
	muted?: boolean;
	source?: string;
}

export interface SensorReading {
	name: string;
	value: number | string | boolean | null;
	unit: string | null;
}

export interface SensorState {
	type: "sensor";
	readings: SensorReading[];
}

export interface ButtonState {
	type: "button";
	pressedAt: string | null;
}

export interface PresenceState {
	type: "presence";
	home: boolean | null;
	zone: string | null;
	battery: number | null;
}

export type AppReport = Omit<AppState, "type" | "location"> & {
	location?: Omit<AppLocation, "at"> | null;
};

export type DeviceState =
	| CoverState
	| ClimateState
	| PrinterState
	| AppState
	| VacuumState
	| ContactState
	| ValveState
	| SwitchState
	| MeterState
	| LinkyState
	| CameraState
	| LightState
	| LockState
	| FanState
	| MediaState
	| SensorState
	| ButtonState
	| PresenceState;

/** How far apart two points are, in metres, along the Earth's surface. */
export function distanceMetres(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number },
): number {
	const radians = (degrees: number) => (degrees * Math.PI) / 180;
	const latitude = radians(to.latitude - from.latitude);
	const longitude = radians(to.longitude - from.longitude);
	const a =
		Math.sin(latitude / 2) ** 2 +
		Math.cos(radians(from.latitude)) *
			Math.cos(radians(to.latitude)) *
			Math.sin(longitude / 2) ** 2;
	return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** A distance from home in words: "At home" under 150 m, then metres, then kilometres. */
export function describeDistance(metres: number): string {
	if (metres < 150) {
		return "At home";
	}
	return metres < 1000
		? `${Math.round(metres / 10) * 10} m away`
		: `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km away`;
}

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
