import type { DeviceState } from "#lib/devices.js";
import {
	definePlugin,
	type DeviceCommand,
	type FoundDevice,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

import { haClient, type HaConnection, type HaState } from "./client.js";
import { haMapping } from "./mapping.js";

const reconnectEveryMs = 30_000;
const saveEveryMs = 5000;
const requestTimeoutMs = 15_000;

/**
 * Home Assistant as a backend: its entities come in as devices, their state follows Home Assistant's state changes
 * over one WebSocket the worker keeps open, and taps become Home Assistant service calls. Every integration Home
 * Assistant has, through the cards LocalAssistant has.
 */
class HomeAssistant implements Plugin {
	#connection: HaConnection | undefined;
	#connecting = false;
	#pending = new Map<string, HaState>();

	/**
	 * Checks Home Assistant answers at the address and accepts the token.
	 *
	 * @throws When it can't be reached or refuses the token.
	 */
	async connect(values: PluginValues): Promise<void> {
		const connection = await haClient.open(
			String(values.url),
			String(values.token),
		);
		connection.close();
	}

	/**
	 * Every entity LocalAssistant has a card for, with its current state.
	 *
	 * @throws When Home Assistant isn't connected, can't be reached or refuses the token.
	 */
	async discover(context: PluginContext): Promise<FoundDevice[]> {
		const connection = await this.#open(context);
		try {
			return (await connection.states()).flatMap((entity) => {
				const device = haMapping.device(entity);
				return device ? [device] : [];
			});
		} finally {
			connection.close();
		}
	}

	/** Keeps one connection open, reconnecting every thirty seconds when it drops, and saves state changes every five seconds. */
	async start(context: PluginContext): Promise<void> {
		if (!context.settings()) {
			return;
		}
		this.#pending.clear();
		context.every(reconnectEveryMs, () => this.keepConnected(context));
		context.every(saveEveryMs, () => this.flush(context));
		await this.keepConnected(context);
	}

	/** Closes the connection. */
	stop(): void {
		this.#connection?.close();
		this.#connection = undefined;
	}

	/** Opens the connection if it's closed, saves every known entity's state and follows the changes; a failure is logged. */
	async keepConnected(context: PluginContext): Promise<void> {
		if ((this.#connection && !this.#connection.closed) || this.#connecting) {
			return;
		}
		this.#connecting = true;
		try {
			const connection = await this.#open(context);
			this.#connection = connection;
			for (const entity of await connection.states()) {
				this.#pending.set(entity.entity_id, entity);
			}
			this.flush(context);
			await connection.follow((entity) => {
				this.#pending.set(entity.entity_id, entity);
			});
			context.logger.info("Connected to Home Assistant");
		} catch (error) {
			context.logger.warn("Home Assistant connection failed", undefined, error);
		} finally {
			this.#connecting = false;
		}
	}

	/** Saves the latest state of every changed entity that is one of the plugin's devices. */
	flush(context: PluginContext): void {
		if (this.#pending.size === 0) {
			return;
		}
		for (const device of context.devices()) {
			const entity = this.#pending.get(device.externalId);
			if (entity) {
				context.saveState(device, haMapping.state(device.kind, entity));
			}
		}
		this.#pending.clear();
	}

	/**
	 * Carries out a command as Home Assistant service calls and returns the state it should now be in.
	 *
	 * @throws When the device can't take that command, or Home Assistant can't be reached or refuses it.
	 */
	async command(
		device: PluginDevice,
		command: DeviceCommand,
		context: PluginContext,
	): Promise<DeviceState | void> {
		const hvacModes = String(device.fields.hvacModes ?? "")
			.split(",")
			.filter(Boolean);
		const calls = haMapping.services(device.kind, command, hvacModes);
		const connection = await this.#open(context);
		try {
			for (const call of calls) {
				await connection.service(
					call.domain,
					call.service,
					device.externalId,
					call.data,
				);
			}
		} finally {
			connection.close();
		}
		const state = device.state;
		if (command.type === "switch" && state?.type === "switch") {
			return { ...state, on: command.on };
		}
		if (command.type === "climate" && state?.type === "climate") {
			const change = command.change;
			return {
				...state,
				power: change.power ?? (change.mode ? true : state.power),
				mode: change.mode ?? state.mode,
				targetTemperature: change.targetTemperature ?? state.targetTemperature,
			};
		}
	}

	/**
	 * A camera's `snapshot.jpg` or its live `stream`, through Home Assistant's camera proxy.
	 *
	 * @throws When Home Assistant isn't connected or can't be reached.
	 */
	async serve(
		device: PluginDevice,
		path: string,
		_request: Request,
		context: PluginContext,
	): Promise<Response> {
		const paths: Record<string, string> = {
			"snapshot.jpg": "camera_proxy",
			stream: "camera_proxy_stream",
		};
		const proxy = paths[path];
		if (!proxy || device.kind !== "home-assistant-camera") {
			return new Response("Not found", { status: 404 });
		}
		const { url, token } = this.#settings(context);
		let response: Response;
		try {
			response = await fetch(
				`${url.replace(/\/+$/, "")}/api/${proxy}/${encodeURIComponent(device.externalId)}`,
				{
					headers: { Authorization: `Bearer ${token}` },
					...(path === "stream"
						? {}
						: { signal: AbortSignal.timeout(requestTimeoutMs) }),
				},
			);
		} catch (error) {
			throw new Error("Home Assistant can't be reached.", { cause: error });
		}
		if (!response.ok) {
			throw new Error(`Home Assistant answered ${response.status}.`);
		}
		return new Response(response.body, {
			headers: {
				"Content-Type": response.headers.get("content-type") ?? "image/jpeg",
				"Cache-Control": "no-store",
			},
		});
	}

	#settings(context: PluginContext): { url: string; token: string } {
		const settings = context.settings();
		if (
			typeof settings?.url !== "string" ||
			typeof settings.token !== "string"
		) {
			throw new Error("Connect Home Assistant first.");
		}
		return { url: settings.url, token: settings.token };
	}

	#open(context: PluginContext): Promise<HaConnection> {
		const { url, token } = this.#settings(context);
		return haClient.open(url, token);
	}
}

export default definePlugin(new HomeAssistant());
