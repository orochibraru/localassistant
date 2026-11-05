import type { Duplex } from "node:stream";
import { connect, type ConnectionOptions, type TLSSocket } from "node:tls";

import { castProtocol } from "./protocol.js";

export const castNamespaces = {
	connection: "urn:x-cast:com.google.cast.tp.connection",
	heartbeat: "urn:x-cast:com.google.cast.tp.heartbeat",
	receiver: "urn:x-cast:com.google.cast.receiver",
	media: "urn:x-cast:com.google.cast.media",
} as const;

export const receiverId = "receiver-0";

export type CastPayload = Record<string, unknown>;

export type CastListener = (namespace: string, payload: CastPayload) => void;

interface Pending {
	resolve: (payload: CastPayload) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

const senderId = "sender-0";
const answerTimeoutMs = 10_000;
const heartbeatEveryMs = 5000;
const silenceLimitMs = 30_000;
const refusals = new Set([
	"INVALID_REQUEST",
	"INVALID_PLAYER_STATE",
	"LAUNCH_ERROR",
	"LOAD_FAILED",
	"LOAD_CANCELLED",
]);

/** One open Cast v2 channel to a device: request and answer by `requestId`, heartbeats, and the statuses it pushes. */
export class CastConnection {
	readonly #socket: Duplex;
	readonly #heartbeat: ReturnType<typeof setInterval>;
	readonly #pending = new Map<number, Pending>();
	readonly #joined = new Set<string>();
	#buffer = Buffer.alloc(0);
	#nextRequestId = 1;
	#heardAt = Date.now();
	#closed = false;
	#onPush: CastListener | undefined;

	/** Wraps a socket already connected to the device, opens the channel to its receiver and starts the heartbeat. */
	constructor(socket: Duplex) {
		this.#socket = socket;
		socket.on("data", (chunk: Buffer) => this.#receive(chunk));
		socket.on("error", () => this.close());
		socket.on("close", () => this.close());
		this.#heartbeat = setInterval(() => this.#beat(), heartbeatEveryMs);
		this.join(receiverId);
	}

	/** Whether the channel is gone. */
	get closed(): boolean {
		return this.#closed;
	}

	/** Calls `onPush` with every status the device sends on its own from now on. */
	follow(onPush: CastListener): void {
		this.#onPush = onPush;
	}

	/** Opens the virtual connection to `destination` (the receiver or an app's transport) once. */
	join(destination: string): void {
		if (this.#joined.has(destination)) {
			return;
		}
		this.#joined.add(destination);
		this.send(destination, castNamespaces.connection, { type: "CONNECT" });
	}

	/** Sends one message without waiting for an answer. */
	send(destination: string, namespace: string, payload: CastPayload): void {
		if (this.#closed) {
			return;
		}
		this.#socket.write(
			castProtocol.encode({
				sourceId: senderId,
				destinationId: destination,
				namespace,
				payload: JSON.stringify(payload),
			}),
		);
	}

	/**
	 * Sends one request and waits for the device's answer to it.
	 *
	 * @throws When the device refuses it, doesn't answer in time or the channel closes.
	 */
	request(
		destination: string,
		namespace: string,
		payload: CastPayload,
	): Promise<CastPayload> {
		if (this.#closed) {
			return Promise.reject(
				new Error("The Cast device closed the connection."),
			);
		}
		const requestId = this.#nextRequestId++;
		const { promise, resolve, reject } = Promise.withResolvers<CastPayload>();
		const timer = setTimeout(() => {
			this.#pending.delete(requestId);
			reject(new Error("The Cast device didn't answer in time."));
		}, answerTimeoutMs);
		this.#pending.set(requestId, { resolve, reject, timer });
		this.send(destination, namespace, { ...payload, requestId });
		return promise;
	}

	/** Closes the channel and fails every request still waiting. */
	close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		clearInterval(this.#heartbeat);
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error("The Cast device closed the connection."));
		}
		this.#pending.clear();
		this.#socket.destroy();
	}

	#beat(): void {
		if (Date.now() - this.#heardAt > silenceLimitMs) {
			this.close();
			return;
		}
		this.send(receiverId, castNamespaces.heartbeat, { type: "PING" });
	}

	#receive(chunk: Buffer): void {
		this.#heardAt = Date.now();
		let frames;
		try {
			frames = castProtocol.split(Buffer.concat([this.#buffer, chunk]));
		} catch {
			this.close();
			return;
		}
		this.#buffer = Buffer.from(frames.rest);
		for (const body of frames.bodies) {
			const message = castProtocol.decode(body);
			if (message) {
				this.#handle(message.sourceId, message.namespace, message.payload);
			}
		}
	}

	#handle(source: string, namespace: string, text: string): void {
		let payload: CastPayload;
		try {
			payload = JSON.parse(text) as CastPayload;
		} catch {
			return;
		}
		if (namespace === castNamespaces.heartbeat) {
			if (payload.type === "PING") {
				this.send(source, castNamespaces.heartbeat, { type: "PONG" });
			}
			return;
		}
		if (namespace === castNamespaces.connection) {
			if (payload.type === "CLOSE") {
				this.#joined.delete(source);
			}
			return;
		}
		const requestId =
			typeof payload.requestId === "number" ? payload.requestId : 0;
		const pending = this.#pending.get(requestId);
		if (!pending) {
			this.#onPush?.(namespace, payload);
			return;
		}
		this.#pending.delete(requestId);
		clearTimeout(pending.timer);
		if (refusals.has(String(payload.type))) {
			const reason = typeof payload.reason === "string" ? payload.reason : null;
			pending.reject(
				new Error(
					reason
						? `The Cast device refused it (${reason}).`
						: "The Cast device refused it.",
				),
			);
		} else {
			pending.resolve(payload);
		}
	}
}

/** Opens Cast v2 channels over TLS; Cast devices use a self-signed certificate, so it isn't checked. */
export class CastClient {
	readonly #connect: (options: ConnectionOptions) => TLSSocket;

	/** Opens sockets with `connectTls`, Node's `tls.connect` by default. */
	constructor(connectTls: (options: ConnectionOptions) => TLSSocket = connect) {
		this.#connect = connectTls;
	}

	/**
	 * Connects to the device at `host` and `port`.
	 *
	 * @throws When it can't be reached in time.
	 */
	open(host: string, port: number): Promise<CastConnection> {
		const { promise, resolve, reject } =
			Promise.withResolvers<CastConnection>();
		const unreachable = new Error(
			`The Cast device at ${host} can't be reached. Check it's on and its address.`,
		);
		const socket = this.#connect({
			host,
			port,
			rejectUnauthorized: false,
		});
		const timer = setTimeout(() => {
			socket.destroy();
			reject(unreachable);
		}, answerTimeoutMs);
		socket.on("error", (error) => {
			clearTimeout(timer);
			reject(new Error(unreachable.message, { cause: error }));
		});
		socket.once("secureConnect", () => {
			clearTimeout(timer);
			resolve(new CastConnection(socket));
		});
		return promise;
	}
}

export const castClient = new CastClient();
