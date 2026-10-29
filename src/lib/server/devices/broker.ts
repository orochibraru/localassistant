import mqtt, { type MqttClient } from "mqtt";

import type { DeviceState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { getSetting, type MqttBroker } from "#lib/dto/setting.js";
import { Logger } from "#lib/server/core/logger.js";
import { secrets } from "#lib/server/core/secrets.js";
import { frigate } from "#lib/server/devices/frigate.js";
import { shelly } from "#lib/server/devices/shelly.js";
import { type BridgeDevice, zigbee } from "#lib/server/devices/zigbee.js";

const logger = new Logger("Broker");

const saveEveryMs = 5000;
const connectTimeoutMs = 10_000;
const ignoredSuffixes = ["/set", "/get", "/availability"];

export type StateListener = (
	device: DeviceDTO,
	previous: DeviceState | null,
	next: DeviceState,
) => void | Promise<void>;

/**
 * The household's MQTT broker, where Zigbee2MQTT publishes. The worker keeps one connection to it, imports the devices
 * Zigbee2MQTT lists and saves what they report, a door or window at once and the rest every five seconds; commands from
 * the web server go out on a short connection of their own.
 */
class Broker {
	#client: MqttClient | undefined;
	#pending = new Map<string, Record<string, unknown>>();
	#timer: ReturnType<typeof setInterval> | undefined;
	#listeners: StateListener[] = [];

	/** Calls `listener` whenever a door or window sensor opens or shuts. */
	onContact(listener: StateListener): void {
		this.#listeners.push(listener);
	}

	/** (Re)connects with the stored settings, or just disconnects when there are none. */
	restart(): void {
		this.stop();
		const settings = getSetting("mqtt");
		if (!settings) {
			return;
		}
		const client = this.#connect(settings, 30_000);
		client.on("connect", () => {
			logger.info("Connected to the MQTT broker");
			client.subscribe([
				`${settings.zigbeeTopic}/#`,
				"+/status/+",
				"frigate/events",
			]);
		});
		client.on("error", (error) =>
			logger.warn("MQTT broker error", undefined, error),
		);
		client.on("message", (topic, payload) => {
			void this.handle(settings, topic, payload).catch((error: unknown) =>
				logger.warn("MQTT message failed", { topic }, error),
			);
		});
		this.#client = client;
		this.#timer = setInterval(() => this.flush(), saveEveryMs);
	}

	/** Closes the connection and saves what's waiting. */
	stop(): void {
		this.flush();
		clearInterval(this.#timer);
		this.#client?.end(true);
		this.#client = undefined;
	}

	/** Saves every report waiting to be written, over the device's latest state. */
	flush(): void {
		for (const [deviceId, payload] of this.#pending) {
			const device = DeviceDTO.find(deviceId);
			if (device?.state) {
				device.saveState(zigbee.merge(device.state, payload));
			}
		}
		this.#pending.clear();
	}

	/** Handles one message from the broker: the device list, or a device's state. */
	async handle(
		settings: MqttBroker,
		topic: string,
		payload: Buffer | string,
	): Promise<void> {
		const base = `${settings.zigbeeTopic}/`;
		if (topic === "frigate/events") {
			frigate.alert(this.#parse(payload));
			return;
		}
		if (!topic.startsWith(base)) {
			this.#shelly(settings, topic, this.#parse(payload));
			return;
		}
		const rest = topic.slice(base.length);
		const body = this.#parse(payload);
		if (rest === "bridge/devices") {
			this.#import(
				settings,
				Array.isArray(body) ? (body as BridgeDevice[]) : [],
			);
			return;
		}
		if (
			rest.startsWith("bridge/") ||
			ignoredSuffixes.some((suffix) => rest.endsWith(suffix)) ||
			!body ||
			Array.isArray(body) ||
			typeof body !== "object"
		) {
			return;
		}
		const device = DeviceDTO.all().find(
			(entry) => entry.kind.startsWith("zigbee-") && entry.host === rest,
		);
		if (!device?.state) {
			return;
		}
		const report = {
			...this.#pending.get(device.id),
			...(body as Record<string, unknown>),
		};
		const previous = device.state;
		const next = zigbee.merge(previous, report);
		if (
			next.type === "contact" &&
			previous.type === "contact" &&
			next.open !== previous.open
		) {
			this.#pending.delete(device.id);
			device.saveState(next);
			for (const listener of this.#listeners) {
				await listener(device, previous, next);
			}
			return;
		}
		this.#pending.set(device.id, report);
	}

	/**
	 * Sends `payload` to a Zigbee device's `set` topic, on the worker's connection when it has one.
	 *
	 * @throws When no broker is set up, it can't be reached or refuses the credentials.
	 */
	async publish(
		device: DeviceDTO,
		payload: Record<string, unknown>,
	): Promise<void> {
		const settings = getSetting("mqtt");
		if (!settings || !device.host) {
			throw new Error("Connect the MQTT broker first.");
		}
		const topic = `${settings.zigbeeTopic}/${device.host}/set`;
		if (this.#client?.connected) {
			await this.#client.publishAsync(topic, JSON.stringify(payload));
			return;
		}
		await this.check(settings, (client) =>
			client.publishAsync(topic, JSON.stringify(payload)).then(() => undefined),
		);
	}

	/**
	 * Connects once with `settings`, runs `work` on the connection and closes it.
	 *
	 * @throws When the broker can't be reached or refuses the credentials.
	 */
	async check(
		settings: MqttBroker,
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

	#shelly(settings: MqttBroker, topic: string, body: unknown): void {
		const [prefix, section, component] = topic.split("/");
		if (
			section !== "status" ||
			!prefix ||
			!component ||
			!body ||
			typeof body !== "object"
		) {
			return;
		}
		const homeId = (HomeDTO.find(settings.homeId) ?? HomeDTO.first()).id;
		for (const reading of shelly.readings(
			component,
			body as Record<string, unknown>,
		)) {
			const externalId = `${prefix}/${reading.channel}`;
			let device = DeviceDTO.all().find(
				(entry) =>
					entry.kind === "shelly-meter" && entry.externalId === externalId,
			);
			if (!device) {
				device = DeviceDTO.upsert({
					kind: "shelly-meter",
					homeId,
					name: `${prefix} ${reading.channel}`,
					externalId,
					host: prefix,
				});
				device.saveState({ type: "meter", power: null, energy: null });
			}
			this.#pending.set(device.id, {
				...this.#pending.get(device.id),
				...(reading.power === undefined ? {} : { power: reading.power }),
				...(reading.energy === undefined ? {} : { energy: reading.energy }),
			});
		}
	}

	#import(settings: MqttBroker, bridge: BridgeDevice[]): void {
		const homeId = (HomeDTO.find(settings.homeId) ?? HomeDTO.first()).id;
		const known = DeviceDTO.all();
		for (const found of zigbee.devices(bridge)) {
			const existing = known.find(
				(device) =>
					device.kind === found.kind && device.externalId === found.ieeeAddress,
			);
			const device = DeviceDTO.upsert({
				kind: found.kind,
				homeId: existing?.toJSON().homeId ?? homeId,
				name: existing?.toJSON().name ?? found.name,
				roomId: existing?.toJSON().roomId ?? null,
				externalId: found.ieeeAddress,
				host: found.friendlyName,
			});
			if (device.state?.type !== found.state.type) {
				device.saveState(found.state);
			}
		}
	}

	#connect(settings: MqttBroker, reconnectPeriod: number): MqttClient {
		return mqtt.connect(settings.url, {
			username: settings.username ?? undefined,
			password: settings.encryptedPassword
				? secrets.decrypt(settings.encryptedPassword)
				: undefined,
			connectTimeout: connectTimeoutMs,
			reconnectPeriod,
		});
	}

	#parse(payload: Buffer | string): unknown {
		try {
			return JSON.parse(String(payload));
		} catch {
			return null;
		}
	}
}

export const broker = new Broker();
