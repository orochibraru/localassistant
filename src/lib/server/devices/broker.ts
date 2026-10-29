import mqtt, { type MqttClient } from "mqtt";

import { getSetting, type MqttBroker } from "#lib/dto/setting.js";
import { Logger } from "#lib/server/core/logger.js";
import { secrets } from "#lib/server/core/secrets.js";

const logger = new Logger("Broker");

const connectTimeoutMs = 10_000;

export type MqttHandler = (
	topic: string,
	payload: Buffer,
) => void | Promise<void>;

interface Subscription {
	owner: string;
	filter: string;
	handler: MqttHandler;
}

/**
 * The household's MQTT broker, shared by every plugin that needs one. The worker keeps one connection and hands each
 * message to the plugins subscribed to its topic; publishing from the web server opens a short connection of its own.
 */
class Broker {
	#client: MqttClient | undefined;
	#subscriptions: Subscription[] = [];

	/** Whether an admin connected a broker. */
	configured(): boolean {
		return getSetting("mqtt") !== null;
	}

	/** Hands `owner` every message whose topic matches `filter`, subscribing at once when connected. */
	subscribe(owner: string, filter: string, handler: MqttHandler): void {
		this.#subscriptions.push({ owner, filter, handler });
		if (this.#client?.connected) {
			this.#client.subscribe(filter);
		}
	}

	/** Drops every subscription of `owner`, unsubscribing the filters nobody else wants. */
	unsubscribeAll(owner: string): void {
		const dropped = this.#subscriptions.filter(
			(entry) => entry.owner === owner,
		);
		this.#subscriptions = this.#subscriptions.filter(
			(entry) => entry.owner !== owner,
		);
		const kept = new Set(this.#subscriptions.map((entry) => entry.filter));
		const unused = [...new Set(dropped.map((entry) => entry.filter))].filter(
			(filter) => !kept.has(filter),
		);
		if (unused.length > 0 && this.#client?.connected) {
			this.#client.unsubscribe(unused);
		}
	}

	/** (Re)connects with the stored settings, or just disconnects when there are none; subscriptions stay. */
	restart(): void {
		this.stop();
		const settings = getSetting("mqtt");
		if (!settings) {
			return;
		}
		const client = this.#connect(settings, 30_000);
		client.on("connect", () => {
			logger.info("Connected to the MQTT broker");
			const filters = [
				...new Set(this.#subscriptions.map((entry) => entry.filter)),
			];
			if (filters.length > 0) {
				client.subscribe(filters);
			}
		});
		client.on("error", (error) =>
			logger.warn("MQTT broker error", undefined, error),
		);
		client.on("message", (topic, payload) => this.dispatch(topic, payload));
		this.#client = client;
	}

	/** Closes the connection. */
	stop(): void {
		this.#client?.end(true);
		this.#client = undefined;
	}

	/** Hands one message to every matching subscription; a failing handler is logged, never thrown. */
	dispatch(topic: string, payload: Buffer): void {
		for (const subscription of this.#subscriptions) {
			if (!this.matches(subscription.filter, topic)) {
				continue;
			}
			void Promise.resolve()
				.then(() => subscription.handler(topic, payload))
				.catch((error: unknown) =>
					logger.warn(
						"MQTT message failed",
						{ topic, plugin: subscription.owner },
						error,
					),
				);
		}
	}

	/** Whether `topic` matches the MQTT `filter`, with `+` for one level and a trailing `#` for the rest. */
	matches(filter: string, topic: string): boolean {
		const wanted = filter.split("/");
		const given = topic.split("/");
		for (const [index, level] of wanted.entries()) {
			if (level === "#") {
				return true;
			}
			if (index >= given.length || (level !== "+" && level !== given[index])) {
				return false;
			}
		}
		return wanted.length === given.length;
	}

	/**
	 * Publishes `payload` on `topic`, on the worker's connection when it has one.
	 *
	 * @throws When no broker is set up, it can't be reached or refuses the credentials.
	 */
	async publish(
		topic: string,
		payload: string | Record<string, unknown>,
	): Promise<void> {
		const body =
			typeof payload === "string" ? payload : JSON.stringify(payload);
		if (this.#client?.connected) {
			await this.#client.publishAsync(topic, body);
			return;
		}
		const settings = getSetting("mqtt");
		if (!settings) {
			throw new Error("Connect the MQTT broker first.");
		}
		await this.check(settings, (client) =>
			client.publishAsync(topic, body).then(() => undefined),
		);
	}

	/**
	 * Connects once with `settings`, runs `work` on the connection and closes it.
	 *
	 * @throws When the broker can't be reached or refuses the credentials.
	 */
	async check(
		settings: Omit<MqttBroker, "homeId">,
		work: (client: MqttClient) => Promise<void> = () => Promise.resolve(),
	): Promise<void> {
		const client = this.#connect(settings, 0);
		try {
			await new Promise<void>((resolve, reject) => {
				client.once("connect", () => resolve());
				client.once("error", (error) =>
					reject(
						new Error(
							/auth|Not authorized|Bad username/i.test(error.message)
								? "The broker refused that username and password."
								: `The broker refused the connection: ${error.message}`,
						),
					),
				);
				client.once("close", () =>
					reject(new Error("The broker can't be reached. Check its address.")),
				);
			});
			await work(client);
		} finally {
			client.end(true);
		}
	}

	#connect(
		settings: Omit<MqttBroker, "homeId">,
		reconnectPeriod: number,
	): MqttClient {
		return mqtt.connect(settings.url, {
			username: settings.username ?? undefined,
			password: settings.encryptedPassword
				? secrets.decrypt(settings.encryptedPassword)
				: undefined,
			connectTimeout: connectTimeoutMs,
			reconnectPeriod,
		});
	}
}

export const broker = new Broker();
