import mqtt, { type MqttClient } from "mqtt";

import {
	type PrinterSpeed,
	printerSpeeds,
	type PrinterStage,
	type PrinterState,
} from "#lib/devices.js";
import type { DeviceDTO } from "#lib/dto/device.js";
import { Logger } from "#lib/server/core/logger.js";
import { secrets } from "#lib/server/core/secrets.js";

const logger = new Logger("Bambu");

const port = 8883;
const firstReportTimeoutMs = 10_000;
const commandReplyTimeoutMs = 5_000;
const saveEveryMs = 5000;

const stages: Record<string, PrinterStage> = {
	IDLE: "idle",
	PREPARE: "preparing",
	SLICING: "preparing",
	RUNNING: "printing",
	PAUSE: "paused",
	FINISH: "finished",
	FAILED: "failed",
};

type Report = Record<string, unknown>;

interface Watch {
	key: string;
	client: MqttClient;
	print: Report | undefined;
	error: Error | undefined;
	dirty: boolean;
	timer: ReturnType<typeof setInterval>;
}

/**
 * Bambu Lab printers over their LAN MQTT broker. The worker keeps one connection per printer, asks for the full state
 * once on connect and merges the changes the printer pushes after that; commands go out on a short connection of
 * their own.
 */
class BambuPrinters {
	#watches = new Map<string, Watch>();

	/**
	 * The printer's current state, connecting and asking for it the first time.
	 *
	 * @throws When the printer can't be reached, refuses the access code or never reports.
	 */
	async read(device: DeviceDTO): Promise<PrinterState> {
		const watch = this.#watch(device);
		const deadline = Date.now() + firstReportTimeoutMs;
		while (!watch.print && !watch.error && Date.now() < deadline) {
			await Bun.sleep(100);
		}
		if (watch.error) {
			throw watch.error;
		}
		if (!watch.print) {
			throw new Error("The printer didn't answer. Check its IP address.");
		}
		return this.state(watch.print);
	}

	/** Closes the connection of every printer not in `deviceIds`, for removed or reconfigured ones. */
	forgetExcept(deviceIds: Set<string>): void {
		for (const [deviceId, watch] of this.#watches) {
			if (!deviceIds.has(deviceId)) {
				this.#close(deviceId, watch);
			}
		}
	}

	/**
	 * Sends one request to the printer and waits for its answer when it gives one.
	 *
	 * @throws When the printer can't be reached, refuses the access code, or refuses the command (no Developer Mode).
	 */
	async send(
		device: DeviceDTO,
		request: Record<string, Report>,
	): Promise<void> {
		const client = this.#connect(device, 0);
		const [section, body] = Object.entries(request)[0] ?? [];
		const sequenceId = String(Date.now() % 1_000_000);
		try {
			await new Promise<void>((resolve, reject) => {
				client.once("error", (error) => reject(this.#explain(error)));
				client.once("close", () =>
					reject(new Error("The printer is off or unreachable.")),
				);
				client.once("connect", () => resolve());
			});
			const reply = this.#reply(client, section ?? "", sequenceId);
			await client.subscribeAsync(this.#topic(device, "report"));
			await client.publishAsync(
				this.#topic(device, "request"),
				JSON.stringify({
					[section ?? ""]: { ...body, sequence_id: sequenceId },
				}),
				{ qos: 1 },
			);
			const answer = await reply;
			if (
				answer &&
				answer.result !== undefined &&
				answer.result !== "success"
			) {
				throw new Error(
					"The printer refused it. Turn on LAN-only mode and Developer Mode on the printer.",
				);
			}
		} finally {
			client.end(true);
		}
	}

	/** Maps the printer's `print` report to a state. */
	state(print: Report): PrinterState {
		const lights = Array.isArray(print.lights_report)
			? (print.lights_report as { node?: unknown; mode?: unknown }[])
			: [];
		const chamber = lights.find((light) => light.node === "chamber_light");
		const speed = this.#number(print.spd_lvl);
		return {
			type: "printer",
			stage: stages[String(print.gcode_state)] ?? "idle",
			progress: this.#number(print.mc_percent),
			remainingMinutes: this.#number(print.mc_remaining_time),
			fileName:
				typeof print.subtask_name === "string" && print.subtask_name
					? print.subtask_name
					: null,
			layer: this.#number(print.layer_num),
			totalLayers: this.#number(print.total_layer_num),
			nozzle: {
				temperature: this.#number(print.nozzle_temper),
				target: this.#number(print.nozzle_target_temper),
			},
			bed: {
				temperature: this.#number(print.bed_temper),
				target: this.#number(print.bed_target_temper),
			},
			light: chamber ? chamber.mode !== "off" : null,
			speed: printerSpeeds.includes(speed as PrinterSpeed)
				? (speed as PrinterSpeed)
				: null,
		};
	}

	#watch(device: DeviceDTO): Watch {
		const key = `${device.host}|${device.externalId}|${device.encryptedLocalKey()}`;
		const existing = this.#watches.get(device.id);
		if (existing?.key === key) {
			return existing;
		}
		if (existing) {
			this.#close(device.id, existing);
		}
		const client = this.#connect(device, 30_000);
		const watch: Watch = {
			key,
			client,
			print: undefined,
			error: undefined,
			dirty: false,
			timer: setInterval(() => {
				if (watch.dirty && watch.print) {
					watch.dirty = false;
					device.saveState(this.state(watch.print));
				}
			}, saveEveryMs),
		};
		client.on("connect", () => {
			watch.error = undefined;
			client.subscribe(this.#topic(device, "report"));
			client.publish(
				this.#topic(device, "request"),
				JSON.stringify({
					pushing: {
						sequence_id: "0",
						command: "pushall",
						version: 1,
						push_target: 1,
					},
				}),
			);
		});
		client.on("message", (_topic, payload) => {
			const print = this.#parse(payload)?.print;
			if (print && typeof print === "object") {
				watch.print = { ...watch.print, ...(print as Report) };
				watch.dirty = true;
			}
		});
		client.on("error", (error) => {
			watch.error = this.#explain(error);
			logger.debug("Printer connection error", { device: device.id }, error);
		});
		client.on("offline", () => {
			watch.error ??= new Error("The printer is off or unreachable.");
		});
		this.#watches.set(device.id, watch);
		return watch;
	}

	#connect(device: DeviceDTO, reconnectPeriod: number): MqttClient {
		const encrypted = device.encryptedLocalKey();
		if (!device.host || !encrypted) {
			throw new Error("This printer has no address or access code.");
		}
		return mqtt.connect(`mqtts://${device.host}:${port}`, {
			username: "bblp",
			password: secrets.decrypt(encrypted),
			rejectUnauthorized: false,
			connectTimeout: 10_000,
			reconnectPeriod,
		});
	}

	#reply(
		client: MqttClient,
		section: string,
		sequenceId: string,
	): Promise<Report | undefined> {
		return new Promise((resolve) => {
			const timeout = setTimeout(
				() => resolve(undefined),
				commandReplyTimeoutMs,
			);
			client.on("message", (_topic, payload) => {
				const answer = this.#parse(payload)?.[section];
				if (
					answer &&
					typeof answer === "object" &&
					(answer as Report).sequence_id === sequenceId
				) {
					clearTimeout(timeout);
					resolve(answer as Report);
				}
			});
		});
	}

	#close(deviceId: string, watch: Watch): void {
		clearInterval(watch.timer);
		watch.client.end(true);
		this.#watches.delete(deviceId);
	}

	#topic(device: DeviceDTO, direction: "report" | "request"): string {
		return `device/${device.externalId}/${direction}`;
	}

	#parse(payload: Buffer): Report | undefined {
		try {
			return JSON.parse(payload.toString()) as Report;
		} catch {
			return undefined;
		}
	}

	#explain(error: Error): Error {
		return /not authori[sz]ed|bad user ?name or password/i.test(error.message)
			? new Error("The printer refused the access code.")
			: new Error("The printer is off or unreachable.", { cause: error });
	}

	#number(value: unknown): number | null {
		return typeof value === "number" && Number.isFinite(value) ? value : null;
	}
}

export const bambuPrinters = new BambuPrinters();
