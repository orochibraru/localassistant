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

export const vacuumSuctions = ["quiet", "standard", "strong", "max"] as const;

export type VacuumSuction = (typeof vacuumSuctions)[number];

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

export const dockStatuses = [
	"ok",
	"low",
	"full",
	"missing",
	"check",
	"off",
] as const;

export type DockStatus = (typeof dockStatuses)[number];

export interface VacuumDock {
	cleanWater: DockStatus | null;
	dirtyWater: DockStatus | null;
	dustBag: DockStatus | null;
	detergent: DockStatus | null;
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

export interface ClimateChange {
	power?: boolean;
	mode?: ClimateMode;
	targetTemperature?: number;
	hotWaterBoost?: boolean;
}

export type CoverMove = { action: CoverAction } | { position: number };

export const pluginCards = [
	"cover",
	"climate",
	"printer",
	"vacuum",
	"contact",
	"valve",
	"switch",
	"meter",
	"linky",
	"camera",
	"light",
	"lock",
	"fan",
	"media",
	"sensor",
	"button",
	"presence",
	"app",
] as const;

export type PluginCard = (typeof pluginCards)[number];

export const pluginIcons = [
	"blinds",
	"bot",
	"cctv",
	"door-open",
	"fan",
	"gauge",
	"heater",
	"droplets",
	"lightbulb",
	"lock",
	"mouse-pointer-click",
	"plug",
	"printer",
	"puzzle",
	"smartphone",
	"speaker",
	"thermometer",
	"tv",
	"user",
	"zap",
] as const;

export type PluginIcon = (typeof pluginIcons)[number];

export const pluginFieldTypes = [
	"text",
	"secret",
	"number",
	"boolean",
	"choice",
] as const;

export type PluginFieldType = (typeof pluginFieldTypes)[number];

export const pluginNeeds = ["mqtt"] as const;

export type PluginNeed = (typeof pluginNeeds)[number];

export const pluginRuntimes = ["bun", "process"] as const;

export type PluginRuntime = (typeof pluginRuntimes)[number];

export const pluginPlatforms = [
	"linux-x64",
	"linux-arm64",
	"darwin-x64",
	"darwin-arm64",
] as const;

export type PluginPlatform = (typeof pluginPlatforms)[number];

export const pluginInterpreters = ["python3"] as const;

export type PluginInterpreter = (typeof pluginInterpreters)[number];

export type PluginValue = string | number | boolean;

export type PluginValues = Record<string, PluginValue>;

export interface PluginChoice {
	value: string;
	label: string;
}

export interface PluginField {
	name: string;
	label: string;
	type: PluginFieldType;
	description?: string;
	placeholder?: string;
	optional?: boolean;
	default?: PluginValue;
	choices?: PluginChoice[];
	min?: number;
	max?: number;
	pattern?: string;
	message?: string;
	keyboard?: "decimal" | "url" | "email";
}

export interface PluginKind {
	id: string;
	label: string;
	card: PluginCard;
	icon: PluginIcon;
	size?: "small" | "medium" | "large";
	order?: number;
	houseMeter?: boolean;
	polled?: boolean;
}

export interface PluginConnection {
	description: string;
	connected: string;
	fields: PluginField[];
	find?: string;
}

export interface PluginDeviceForm {
	title: string;
	description: string;
	fields: PluginField[];
	submit: string;
}

export interface PluginManifest {
	id: string;
	name: string;
	description: string;
	author?: string;
	version: string;
	localassistant?: string;
	runtime: PluginRuntime;
	entry: string | Partial<Record<PluginPlatform, string>>;
	interpreter?: PluginInterpreter;
	files: string[];
	icon: PluginIcon;
	needs: PluginNeed[];
	connection?: PluginConnection;
	device?: PluginDeviceForm;
	automatic?: string;
	kinds: PluginKind[];
}

export type DeviceCommand =
	| { type: "cover"; move: CoverMove }
	| { type: "climate"; change: ClimateChange }
	| { type: "printer"; change: PrinterChange }
	| { type: "vacuum"; change: VacuumChange }
	| { type: "valve"; target: number }
	| { type: "switch"; on: boolean }
	| { type: "light"; change: LightChange }
	| { type: "lock"; locked: boolean }
	| { type: "fan"; change: FanChange }
	| { type: "media"; change: MediaChange }
	| { type: "button" };

export interface PluginDevice {
	id: string;
	kind: string;
	name: string;
	externalId: string;
	host: string | null;
	homeId: string | null;
	roomId: string | null;
	fields: PluginValues;
	state: DeviceState | null;
	stateAt: Date | null;
	secret(name: string): string | null;
}

export interface FoundDevice {
	kind: string;
	externalId: string;
	name?: string;
	host?: string | null;
	fields?: PluginValues;
	state?: DeviceState;
}

export interface CameraClip {
	id: string;
	label: string;
	startedAt: string;
	video: string | null;
	image: string | null;
	detail: string | null;
}

export interface CameraClips {
	title: string;
	empty: string;
	clips: CameraClip[];
}

export interface PluginNotification {
	title: string;
	body: string;
	url?: string;
	audience: "admins" | "everyone";
}

export interface PluginLogger {
	debug(
		message: string,
		context?: Record<string, unknown>,
		error?: unknown,
	): void;
	info(
		message: string,
		context?: Record<string, unknown>,
		error?: unknown,
	): void;
	warn(
		message: string,
		context?: Record<string, unknown>,
		error?: unknown,
	): void;
	error(
		message: string,
		context?: Record<string, unknown>,
		error?: unknown,
	): void;
}

export type MqttListener = (
	topic: string,
	payload: Buffer,
) => void | Promise<void>;

export interface PluginMqtt {
	configured(): boolean;
	subscribe(filter: string, listener: MqttListener): void;
	publish(
		topic: string,
		payload: string | Record<string, unknown>,
	): Promise<void>;
}

export interface PluginEnergy {
	readings(device: PluginDevice): { hour: Date; total: number }[];
	record(device: PluginDevice, hour: Date, total: number): void;
}

export interface PluginContext {
	logger: PluginLogger;
	mqtt: PluginMqtt;
	energy: PluginEnergy;
	settings(): PluginValues | null;
	devices(): PluginDevice[];
	device(id: string): PluginDevice | undefined;
	found(devices: FoundDevice[]): number;
	saveState(device: PluginDevice, state: DeviceState): void;
	saveError(device: PluginDevice, message: string): void;
	refreshLater(device: PluginDevice, delayMs: number): void;
	every(intervalMs: number, task: () => void | Promise<void>): void;
	notify(notification: PluginNotification): void;
	folder(...parts: string[]): string;
	sendFile(
		path: string,
		request: Request,
		cacheControl: string,
	): Promise<Response>;
}

export interface Plugin {
	connect?(values: PluginValues, context: PluginContext): Promise<void>;
	discover?(context: PluginContext): Promise<FoundDevice[]>;
	add?(
		values: PluginValues,
		context: PluginContext,
	): FoundDevice | Promise<FoundDevice>;
	start?(context: PluginContext): void | Promise<void>;
	stop?(): void | Promise<void>;
	read?(device: PluginDevice, context: PluginContext): Promise<DeviceState>;
	command?(
		device: PluginDevice,
		command: DeviceCommand,
		context: PluginContext,
	): Promise<DeviceState | void>;
	serve?(
		device: PluginDevice,
		path: string,
		request: Request,
		context: PluginContext,
	): Promise<Response>;
	clips?(device: PluginDevice, context: PluginContext): Promise<CameraClips>;
}

/** Marks `plugin` as a LocalAssistant plugin and types its hooks; it returns it unchanged. */
export function definePlugin(plugin: Plugin): Plugin {
	return plugin;
}
