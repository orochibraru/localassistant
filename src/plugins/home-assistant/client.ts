const answerTimeoutMs = 15_000;

export interface HaState {
	entity_id: string;
	state: string;
	attributes: Record<string, unknown>;
}

interface Message {
	id?: number;
	type: string;
	success?: boolean;
	result?: unknown;
	error?: { message?: string };
	message?: string;
	event?: {
		event_type?: string;
		data?: { entity_id?: string; new_state?: HaState | null };
	};
}

interface Pending {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

/** One signed-in WebSocket connection to Home Assistant's API. */
export class HaConnection {
	readonly #socket: WebSocket;
	#nextId = 1;
	#pending = new Map<number, Pending>();
	#onState: ((state: HaState) => void) | undefined;
	#closed = false;

	/** Wraps a socket that already signed in. */
	constructor(socket: WebSocket) {
		this.#socket = socket;
		socket.addEventListener("message", (event) =>
			this.#receive(String(event.data)),
		);
		socket.addEventListener("close", () => {
			this.#closed = true;
			for (const pending of this.#pending.values()) {
				clearTimeout(pending.timer);
				pending.reject(new Error("Home Assistant closed the connection."));
			}
			this.#pending.clear();
		});
	}

	/** Whether the connection is gone. */
	get closed(): boolean {
		return this.#closed;
	}

	/**
	 * Sends one command and waits for Home Assistant's result.
	 *
	 * @throws When Home Assistant refuses it, doesn't answer in time or the connection closes.
	 */
	call(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
		const id = this.#nextId++;
		const { promise, resolve, reject } = Promise.withResolvers<unknown>();
		const timer = setTimeout(() => {
			this.#pending.delete(id);
			reject(new Error("Home Assistant didn't answer in time."));
		}, answerTimeoutMs);
		this.#pending.set(id, { resolve, reject, timer });
		this.#socket.send(JSON.stringify({ id, type, ...payload }));
		return promise;
	}

	/**
	 * Every entity's current state.
	 *
	 * @throws When Home Assistant refuses or the connection closes.
	 */
	async states(): Promise<HaState[]> {
		const result = await this.call("get_states");
		return Array.isArray(result) ? (result as HaState[]) : [];
	}

	/**
	 * Calls `onState` with every entity state that changes from now on.
	 *
	 * @throws When Home Assistant refuses the subscription.
	 */
	async follow(onState: (state: HaState) => void): Promise<void> {
		this.#onState = onState;
		await this.call("subscribe_events", { event_type: "state_changed" });
	}

	/**
	 * Calls a Home Assistant service on one entity.
	 *
	 * @throws When Home Assistant refuses the call.
	 */
	async service(
		domain: string,
		service: string,
		entityId: string,
		data: Record<string, unknown> = {},
	): Promise<void> {
		await this.call("call_service", {
			domain,
			service,
			service_data: data,
			target: { entity_id: entityId },
		});
	}

	/** Closes the connection. */
	close(): void {
		this.#closed = true;
		this.#socket.close();
	}

	#receive(text: string): void {
		let message: Message;
		try {
			message = JSON.parse(text) as Message;
		} catch {
			return;
		}
		if (message.type === "event") {
			const next = message.event?.data?.new_state;
			if (next) {
				this.#onState?.(next);
			}
			return;
		}
		const pending =
			message.id === undefined ? undefined : this.#pending.get(message.id);
		if (!pending || message.id === undefined) {
			return;
		}
		this.#pending.delete(message.id);
		clearTimeout(pending.timer);
		if (message.success === false) {
			pending.reject(
				new Error(
					`Home Assistant refused it: ${message.error?.message ?? "no reason given"}.`,
				),
			);
		} else {
			pending.resolve(message.result ?? null);
		}
	}
}

/** Opens signed-in connections to Home Assistant from its address and a long-lived access token. */
class HaClient {
	/** Home Assistant's WebSocket address for its web address. */
	socketUrl(url: string): string {
		return `${url.replace(/\/+$/, "").replace(/^http/, "ws")}/api/websocket`;
	}

	/**
	 * Connects and signs in with `token`.
	 *
	 * @throws When Home Assistant can't be reached or refuses the token.
	 */
	open(url: string, token: string): Promise<HaConnection> {
		const { promise, resolve, reject } = Promise.withResolvers<HaConnection>();
		let socket: WebSocket;
		try {
			socket = new WebSocket(this.socketUrl(url));
		} catch (error) {
			return Promise.reject(
				new Error("That isn't a Home Assistant address.", { cause: error }),
			);
		}
		const timer = setTimeout(() => {
			socket.close();
			reject(new Error("Home Assistant can't be reached. Check its address."));
		}, answerTimeoutMs);
		const onMessage = (event: MessageEvent) => {
			let message: Message;
			try {
				message = JSON.parse(String(event.data)) as Message;
			} catch {
				return;
			}
			if (message.type === "auth_required") {
				socket.send(JSON.stringify({ type: "auth", access_token: token }));
			} else if (message.type === "auth_ok") {
				clearTimeout(timer);
				socket.removeEventListener("message", onMessage);
				resolve(new HaConnection(socket));
			} else if (message.type === "auth_invalid") {
				clearTimeout(timer);
				socket.close();
				reject(
					new Error(
						"Home Assistant refused the token. Make a new long-lived access token.",
					),
				);
			}
		};
		socket.addEventListener("message", onMessage);
		socket.addEventListener("error", () => {
			clearTimeout(timer);
			reject(new Error("Home Assistant can't be reached. Check its address."));
		});
		socket.addEventListener("close", () => {
			clearTimeout(timer);
			reject(
				new Error("Home Assistant closed the connection before signing in."),
			);
		});
		return promise;
	}
}

export const haClient = new HaClient();
