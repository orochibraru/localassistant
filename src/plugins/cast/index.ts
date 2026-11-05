import type { MediaState } from "#lib/devices.js";
import {
	definePlugin,
	type DeviceCommand,
	type FoundDevice,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

import {
	castClient,
	type CastConnection,
	castNamespaces,
	type CastPayload,
	receiverId,
} from "./connection.js";
import { castDiscovery } from "./discovery.js";
import { castKind, castMapping, castPort } from "./mapping.js";

const browseForMs = 4000;
const reconnectEveryMs = 30_000;
const settleMs = 500;
const identifyTimeoutMs = 5000;

interface Status {
	receiver: CastPayload;
	media: CastPayload | null;
}

interface Session {
	host: string;
	connection: CastConnection;
	saved: string;
	timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Google Cast devices on the network (Android TV and Google TV, Chromecasts, Nest speakers and displays) found over
 * mDNS and driven over the Cast v2 protocol: the worker keeps a channel open to each one and saves what it pushes.
 */
class Cast implements Plugin {
	readonly #sessions = new Map<string, Session>();
	#connecting = false;

	/**
	 * The Cast devices answering an mDNS browse of a few seconds.
	 *
	 * @throws When this server can't listen for mDNS.
	 */
	discover(): Promise<FoundDevice[]> {
		return castDiscovery.browse(browseForMs);
	}

	/** The device at the address the form gives, known by its Cast id when it says it, else by its address. */
	async add(values: PluginValues): Promise<FoundDevice> {
		const host = String(values.host).trim();
		const identity = await this.#identify(host);
		return {
			kind: castKind,
			externalId: identity?.id ?? host,
			name: identity?.name,
			host,
			fields: { port: castPort },
		};
	}

	/**
	 * Opens a channel to the address the form gives and says what it runs.
	 *
	 * @throws When nothing answers Cast at that address.
	 */
	async test(values: PluginValues): Promise<string> {
		const host = String(values.host).trim();
		const connection = await castClient.open(host, castPort);
		try {
			const status = await this.#status(connection);
			const state = castMapping.state(status.receiver, status.media);
			const name = (await this.#identify(host))?.name ?? "The Cast device";
			return state.source
				? `${name} answered, running ${state.source}.`
				: `${name} answered, nothing is casting to it.`;
		} finally {
			connection.close();
		}
	}

	/** Keeps a channel open to every device, opening the missing ones every thirty seconds. */
	async start(context: PluginContext): Promise<void> {
		context.every(reconnectEveryMs, () => this.keepConnected(context));
		await this.keepConnected(context);
	}

	/** Closes every channel. */
	stop(): void {
		for (const session of this.#sessions.values()) {
			clearTimeout(session.timer);
			session.connection.close();
		}
		this.#sessions.clear();
	}

	/** Opens a channel to each device that has none, follows what it pushes and closes the ones of removed devices. */
	async keepConnected(context: PluginContext): Promise<void> {
		if (this.#connecting) {
			return;
		}
		this.#connecting = true;
		try {
			const current = context.devices();
			for (const [id, session] of this.#sessions) {
				const device = current.find((candidate) => candidate.id === id);
				if (!device || device.host !== session.host) {
					clearTimeout(session.timer);
					session.connection.close();
					this.#sessions.delete(id);
				}
			}
			await Promise.all(current.map((device) => this.#follow(context, device)));
		} finally {
			this.#connecting = false;
		}
	}

	/**
	 * Reads the device's volume, app and media.
	 *
	 * @throws When the device can't be reached.
	 */
	async read(device: PluginDevice): Promise<MediaState> {
		const connection = await this.#open(device);
		try {
			const status = await this.#status(connection);
			return castMapping.state(status.receiver, status.media);
		} finally {
			connection.close();
		}
	}

	/**
	 * Carries out a media change and returns the state it leaves the device in.
	 *
	 * @throws When the device can't be reached, or it or its app can't do what the change asks.
	 */
	async command(
		device: PluginDevice,
		command: DeviceCommand,
	): Promise<MediaState> {
		if (command.type !== "media") {
			throw new Error("A Cast device only takes media changes.");
		}
		const connection = await this.#open(device);
		try {
			const status = await this.#status(connection);
			const transportId =
				castMapping.application(status.receiver)?.transportId ?? "";
			for (const request of castMapping.requests(
				command.change,
				status.receiver,
				status.media,
			)) {
				if (request.target === "media") {
					connection.join(transportId);
				}
				await connection.request(
					request.target === "media" ? transportId : receiverId,
					request.target === "media"
						? castNamespaces.media
						: castNamespaces.receiver,
					request.payload,
				);
			}
			const after = await this.#status(connection);
			return castMapping.state(after.receiver, after.media);
		} finally {
			connection.close();
		}
	}

	async #follow(context: PluginContext, device: PluginDevice): Promise<void> {
		const existing = this.#sessions.get(device.id);
		if (existing && !existing.connection.closed) {
			return;
		}
		try {
			const connection = await this.#open(device);
			const session: Session = {
				host: device.host ?? "",
				connection,
				saved: "",
				timer: undefined,
			};
			this.#sessions.set(device.id, session);
			connection.follow(() => {
				clearTimeout(session.timer);
				session.timer = setTimeout(() => {
					void this.#save(context, device, session).catch((error: unknown) =>
						context.logger.debug(
							"Cast status failed",
							{ device: device.id },
							error,
						),
					);
				}, settleMs);
			});
			await this.#save(context, device, session);
		} catch (error) {
			context.saveError(
				device,
				error instanceof Error ? error.message : "It can't be reached.",
			);
			context.logger.debug(
				"Cast device unreachable",
				{ device: device.id },
				error,
			);
		}
	}

	async #save(
		context: PluginContext,
		device: PluginDevice,
		session: Session,
	): Promise<void> {
		const status = await this.#status(session.connection);
		const state = castMapping.state(status.receiver, status.media);
		const serialized = JSON.stringify(state);
		if (serialized !== session.saved) {
			session.saved = serialized;
			context.saveState(device, state);
		}
	}

	async #status(connection: CastConnection): Promise<Status> {
		const receiver = await connection.request(
			receiverId,
			castNamespaces.receiver,
			{ type: "GET_STATUS" },
		);
		const application = castMapping.application(receiver);
		if (!application?.media || !application.transportId) {
			return { receiver, media: null };
		}
		connection.join(application.transportId);
		const media = await connection.request(
			application.transportId,
			castNamespaces.media,
			{ type: "GET_STATUS" },
		);
		return { receiver, media };
	}

	#open(device: PluginDevice): Promise<CastConnection> {
		if (!device.host) {
			throw new Error("This Cast device has no address. Find it again.");
		}
		const port = Number(device.fields.port);
		return castClient.open(
			device.host,
			Number.isInteger(port) && port > 0 ? port : castPort,
		);
	}

	async #identify(host: string): Promise<{ id: string; name: string } | null> {
		try {
			const response = await fetch(
				`http://${host}:8008/setup/eureka_info?params=name,device_info`,
				{ signal: AbortSignal.timeout(identifyTimeoutMs) },
			);
			const info = response.ok
				? ((await response.json()) as { name?: unknown; ssdp_udn?: unknown })
				: {};
			return typeof info.ssdp_udn === "string" && typeof info.name === "string"
				? { id: info.ssdp_udn.replaceAll("-", ""), name: info.name }
				: null;
		} catch {
			return null;
		}
	}
}

export default definePlugin(new Cast());
