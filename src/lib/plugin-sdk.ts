import type {
	ClimateChange,
	CoverMove,
	DeviceState,
	FanChange,
	LightChange,
	MediaChange,
	PrinterChange,
	VacuumChange,
} from "#lib/devices.js";
import type { PluginValues } from "#lib/plugins.js";

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
