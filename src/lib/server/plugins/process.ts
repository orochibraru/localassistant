import { join } from "node:path";

import type { DeviceState } from "#lib/devices.js";
import type {
	CameraClips,
	DeviceCommand,
	FoundDevice,
	Plugin,
	PluginContext,
	PluginDevice,
	PluginNotification,
} from "#lib/plugin-sdk.js";
import type { PluginManifest, PluginValues } from "#lib/plugins.js";
import { Logger } from "#lib/server/core/logger.js";

export const protocolVersion = 1;

const startTimeoutMs = 10_000;
const callTimeoutMs = 60_000;

interface Message {
	jsonrpc?: string;
	id?: number | string | null;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
	error?: { code?: number; message?: string };
}

interface Pending {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface WireDevice {
	id: string;
	kind: string;
	name: string;
	externalId: string;
	host: string | null;
	homeId: string | null;
	roomId: string | null;
	fields: PluginValues;
	state: DeviceState | null;
	stateAt: string | null;
	secrets: Record<string, string>;
}

/** One plugin's child process and the JSON-RPC conversation with it, restarted when it dies. */
class Child {
	readonly #command: string[];
	readonly #folder: string;
	readonly #context: PluginContext;
	readonly #secretNames: string[];
	readonly #logger: Logger;
	#process: ReturnType<typeof Bun.spawn> | undefined;
	#pending = new Map<number, Pending>();
	#nextId = 1;
	#started = false;
	#hooks: string[] = [];

	/** Prepares the conversation; the process starts on the first call. */
	constructor(
		manifest: PluginManifest,
		command: string[],
		folder: string,
		context: PluginContext,
	) {
		this.#command = command;
		this.#folder = folder;
		this.#context = context;
		this.#logger = new Logger(`Plugin ${manifest.id}`);
		this.#secretNames = [
			...(manifest.device?.fields ?? []),
			...(manifest.connection?.fields ?? []),
		]
			.filter((field) => field.type === "secret")
			.map((field) => field.name);
	}

	/**
	 * The hooks the plugin implements, starting its process first if it isn't running.
	 *
	 * @throws When the process can't start or doesn't answer `initialize`.
	 */
	async hooks(): Promise<string[]> {
		await this.#ensure();
		return this.#hooks;
	}

	/**
	 * Calls `method` on the plugin and waits for its answer, restarting the process if it died.
	 *
	 * @throws When the plugin answers with an error, dies or takes longer than a minute.
	 */
	async call(
		method: string,
		params: Record<string, unknown> = {},
	): Promise<unknown> {
		await this.#ensure();
		if (method === "start") {
			this.#started = true;
		}
		if (method === "stop") {
			this.#started = false;
		}
		return this.#request(method, params, callTimeoutMs);
	}

	/** A device as the plugin receives it, with its secrets decrypted. */
	wire(device: PluginDevice): WireDevice {
		return {
			id: device.id,
			kind: device.kind,
			name: device.name,
			externalId: device.externalId,
			host: device.host,
			homeId: device.homeId,
			roomId: device.roomId,
			fields: device.fields,
			state: device.state,
			stateAt: device.stateAt?.toISOString() ?? null,
			secrets: Object.fromEntries(
				this.#secretNames.flatMap((name) => {
					const value = device.secret(name);
					return value === null ? [] : [[name, value]];
				}),
			),
		};
	}

	/** Stops the process and fails whatever was waiting for it. */
	kill(): void {
		this.#started = false;
		this.#process?.kill();
		this.#process = undefined;
		this.#failAll(new Error("The plugin was stopped."));
	}

	async #ensure(): Promise<void> {
		if (this.#process && this.#process.exitCode === null) {
			return;
		}
		const wasStarted = this.#started;
		const child = Bun.spawn(this.#command, {
			cwd: this.#folder,
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
		this.#process = child;
		void this.#readLines(child.stdout, (line) => this.#receive(line)).catch(
			(error: unknown) =>
				this.#logger.warn("Plugin output failed", undefined, error),
		);
		void this.#readLines(child.stderr, (line) => this.#logger.info(line)).catch(
			(error: unknown) =>
				this.#logger.warn("Plugin log failed", undefined, error),
		);
		void child.exited.then((code) => {
			if (this.#process === child) {
				this.#process = undefined;
				this.#failAll(new Error(`The plugin stopped (exit code ${code}).`));
			}
		});
		const answer = (await this.#request(
			"initialize",
			{ protocolVersion, folder: this.#folder },
			startTimeoutMs,
		)) as { hooks?: unknown } | null;
		this.#hooks = Array.isArray(answer?.hooks)
			? answer.hooks.filter((hook): hook is string => typeof hook === "string")
			: [];
		if (wasStarted) {
			this.#started = true;
			await this.#request("start", {}, callTimeoutMs);
		}
	}

	#request(
		method: string,
		params: Record<string, unknown>,
		timeoutMs: number,
	): Promise<unknown> {
		const id = this.#nextId++;
		const { promise, resolve, reject } = Promise.withResolvers<unknown>();
		const timer = setTimeout(() => {
			this.#pending.delete(id);
			reject(new Error(`The plugin didn't answer ${method} in time.`));
		}, timeoutMs);
		this.#pending.set(id, { resolve, reject, timer });
		this.#write({ jsonrpc: "2.0", id, method, params });
		return promise;
	}

	#write(message: Message): void {
		const stdin = this.#process?.stdin;
		if (stdin && typeof stdin !== "number") {
			stdin.write(`${JSON.stringify(message)}\n`);
			stdin.flush();
		}
	}

	async #readLines(
		stream: ReadableStream<Uint8Array> | number | undefined,
		onLine: (line: string) => void,
	): Promise<void> {
		if (!stream || typeof stream === "number") {
			return;
		}
		const decoder = new TextDecoder();
		let buffered = "";
		for await (const chunk of stream) {
			buffered += decoder.decode(chunk, { stream: true });
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines.filter((entry) => entry.trim())) {
				onLine(line);
			}
		}
	}

	#receive(line: string): void {
		let message: Message;
		try {
			message = JSON.parse(line) as Message;
		} catch {
			this.#logger.info(line);
			return;
		}
		if (message.method) {
			void this.#answer(message);
			return;
		}
		const pending =
			typeof message.id === "number"
				? this.#pending.get(message.id)
				: undefined;
		if (!pending || typeof message.id !== "number") {
			return;
		}
		this.#pending.delete(message.id);
		clearTimeout(pending.timer);
		if (message.error) {
			pending.reject(new Error(message.error.message ?? "The plugin failed."));
		} else {
			pending.resolve(message.result ?? null);
		}
	}

	async #answer(message: Message): Promise<void> {
		const params = message.params ?? {};
		try {
			const result = await this.#host(message.method ?? "", params);
			if (message.id !== undefined && message.id !== null) {
				this.#write({ jsonrpc: "2.0", id: message.id, result: result ?? null });
			}
		} catch (error) {
			if (message.id !== undefined && message.id !== null) {
				this.#write({
					jsonrpc: "2.0",
					id: message.id,
					error: {
						code: -32000,
						message:
							error instanceof Error ? error.message : "The host failed.",
					},
				});
			}
		}
	}

	#device(id: unknown): PluginDevice {
		const device = this.#context.device(String(id));
		if (!device) {
			throw new Error(`Device ${String(id)} isn't one of this plugin's.`);
		}
		return device;
	}

	async #host(
		method: string,
		params: Record<string, unknown>,
	): Promise<unknown> {
		const context = this.#context;
		switch (method) {
			case "log": {
				const level = ["debug", "info", "warn", "error"].includes(
					String(params.level),
				)
					? (String(params.level) as "debug" | "info" | "warn" | "error")
					: "info";
				context.logger[level](
					String(params.message ?? ""),
					params.context as Record<string, unknown> | undefined,
				);
				return null;
			}
			case "settings":
				return context.settings();
			case "devices":
				return context.devices().map((device) => this.wire(device));
			case "device": {
				const device = context.device(String(params.id));
				return device ? this.wire(device) : null;
			}
			case "found":
				return context.found((params.devices ?? []) as FoundDevice[]);
			case "saveState":
				context.saveState(
					this.#device(params.deviceId),
					params.state as DeviceState,
				);
				return null;
			case "saveError":
				context.saveError(
					this.#device(params.deviceId),
					String(params.message),
				);
				return null;
			case "refreshLater":
				context.refreshLater(
					this.#device(params.deviceId),
					Number(params.delayMs),
				);
				return null;
			case "notify":
				context.notify(params as unknown as PluginNotification);
				return null;
			case "folder":
				return context.folder(
					...((params.parts ?? []) as string[]).map(String),
				);
			case "mqtt.configured":
				return context.mqtt.configured();
			case "mqtt.subscribe":
				context.mqtt.subscribe(String(params.filter), (topic, payload) => {
					this.#write({
						jsonrpc: "2.0",
						method: "mqtt.message",
						params: { topic, payload: payload.toString("base64") },
					});
				});
				return null;
			case "mqtt.publish":
				await context.mqtt.publish(
					String(params.topic),
					String(params.payload),
				);
				return null;
			case "energy.readings":
				return context.energy
					.readings(this.#device(params.deviceId))
					.map((reading) => ({
						hour: reading.hour.toISOString(),
						total: reading.total,
					}));
			case "energy.record":
				context.energy.record(
					this.#device(params.deviceId),
					new Date(String(params.hour)),
					Number(params.total),
				);
				return null;
			default:
				throw new Error(`The host has no method ${method}.`);
		}
	}

	#failAll(error: Error): void {
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.#pending.clear();
	}
}

/**
 * Plugins that run as their own process, written in Go, Python or anything that speaks LocalAssistant's JSON-RPC over
 * standard input and output: each becomes a `Plugin` whose hooks are calls to its process.
 */
class ProcessPlugins {
	#children = new Map<string, Child>();

	/** The command that starts the plugin whose files are in `folder`: its binary, or its interpreter and script. */
	command(manifest: PluginManifest, entry: string, folder: string): string[] {
		const path = join(folder, entry);
		return manifest.interpreter ? [manifest.interpreter, path] : [path];
	}

	/**
	 * Starts the plugin's process, asks which hooks it implements and returns a plugin forwarding each of them.
	 *
	 * @throws When the process can't start or doesn't answer `initialize` within ten seconds.
	 */
	async create(
		manifest: PluginManifest,
		entry: string,
		folder: string,
		context: PluginContext,
	): Promise<Plugin> {
		this.kill(manifest.id);
		const child = new Child(
			manifest,
			this.command(manifest, entry, folder),
			folder,
			context,
		);
		this.#children.set(manifest.id, child);
		let hooks: string[];
		try {
			hooks = await child.hooks();
		} catch (error) {
			this.kill(manifest.id);
			throw error;
		}
		const has = (hook: string) => hooks.includes(hook);
		const plugin: Plugin = {};
		if (has("connect")) {
			plugin.connect = async (values) => {
				await child.call("connect", { values });
			};
		}
		if (has("discover")) {
			plugin.discover = async () =>
				((await child.call("discover")) ?? []) as FoundDevice[];
		}
		if (has("add")) {
			plugin.add = async (values) =>
				(await child.call("add", { values })) as FoundDevice;
		}
		if (has("start")) {
			plugin.start = async () => {
				await child.call("start");
			};
		}
		if (has("stop")) {
			plugin.stop = async () => {
				await child.call("stop");
			};
		}
		if (has("read")) {
			plugin.read = async (device) =>
				(await child.call("read", {
					device: child.wire(device),
				})) as DeviceState;
		}
		if (has("command")) {
			plugin.command = async (device, command: DeviceCommand) =>
				((await child.call("command", {
					device: child.wire(device),
					command,
				})) ?? undefined) as DeviceState | undefined;
		}
		if (has("serve")) {
			plugin.serve = async (device, path, request) => {
				const answer = (await child.call("serve", {
					device: child.wire(device),
					path,
					method: request.method,
					headers: Object.fromEntries(request.headers),
				})) as {
					status?: number;
					headers?: Record<string, string>;
					body?: string;
				} | null;
				return new Response(Buffer.from(answer?.body ?? "", "base64"), {
					status: answer?.status ?? 200,
					headers: answer?.headers ?? {},
				});
			};
		}
		if (has("clips")) {
			plugin.clips = async (device) =>
				(await child.call("clips", {
					device: child.wire(device),
				})) as CameraClips;
		}
		return plugin;
	}

	/** Stops the process of plugin `id`, if it has one. */
	kill(id: string): void {
		this.#children.get(id)?.kill();
		this.#children.delete(id);
	}
}

export const processPlugins = new ProcessPlugins();
