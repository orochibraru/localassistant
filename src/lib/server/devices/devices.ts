import type {
	AppReport,
	ClimateChange,
	CoverAction,
	DeviceState,
	PrinterChange,
	VacuumCommand,
} from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { UserDTO } from "#lib/dto/user.js";
import { Logger } from "#lib/server/core/logger.js";
import { bambuPrinters } from "#lib/server/devices/bambu.js";
import { broker } from "#lib/server/devices/broker.js";
import { dreameCloud } from "#lib/server/devices/dreame.js";
import { espHome } from "#lib/server/devices/esphome.js";
import { linky } from "#lib/server/devices/linky.js";
import { melCloud } from "#lib/server/devices/melcloud.js";
import { tuyaCovers } from "#lib/server/devices/tuya.js";

const logger = new Logger("Devices");

const coverSettleMs = 30_000;
const unreachableAlertMs = 60 * 60_000;

/** Reads and drives every kind of device through the integration it belongs to. */
class Devices {
	/**
	 * Reads `device` and records its state, or why it couldn't be read, telling the admins once when it has been
	 * unreachable for an hour; never throws.
	 */
	async refresh(device: DeviceDTO): Promise<void> {
		if (
			device.kind === "app" ||
			device.kind.startsWith("zigbee-") ||
			device.kind === "shelly-meter" ||
			device.kind === "camera" ||
			device.kind === "frigate-camera"
		) {
			return;
		}
		try {
			device.saveState(await this.#read(device));
		} catch (error) {
			logger.warn("Device read failed", { device: device.id }, error);
			device.saveError(this.message(error));
			this.#reportOutage(device);
		}
	}

	/**
	 * Refreshes every device one after the other, so MELCloud never sees a burst, and drops the printer connections of
	 * removed printers; never throws.
	 */
	async refreshAll(): Promise<number> {
		const all = DeviceDTO.all();
		bambuPrinters.forgetExcept(
			new Set(
				all
					.filter((device) => device.kind === "bambu-printer")
					.map((device) => device.id),
			),
		);
		for (const device of all) {
			await this.refresh(device);
		}
		return all.length;
	}

	/**
	 * Opens, closes or stops a cover, then has the worker read where it ended up once it stopped moving.
	 *
	 * @throws When `device` isn't a cover or can't be reached.
	 */
	async coverAction(device: DeviceDTO, action: CoverAction): Promise<void> {
		this.#assertCover(device);
		await tuyaCovers.act(device, action);
		this.#refreshLater(device);
	}

	/**
	 * Moves a cover to `position` (0 closed, 100 open), then has the worker read it once it stopped moving.
	 *
	 * @throws When `device` isn't a cover or can't be reached.
	 */
	async coverPosition(device: DeviceDTO, position: number): Promise<void> {
		this.#assertCover(device);
		await tuyaCovers.moveTo(device, position);
		this.#refreshLater(device);
	}

	/** Opens, closes or stops every cover in `covers` one after the other; returns the ones that failed and why. */
	async coverGroup(
		covers: DeviceDTO[],
		action: CoverAction,
	): Promise<{ name: string; error: string }[]> {
		const failed: { name: string; error: string }[] = [];
		for (const cover of covers.filter(
			(device) => device.kind === "tuya-cover",
		)) {
			await this.coverAction(cover, action).catch((error: unknown) => {
				failed.push({ name: cover.toJSON().name, error: this.message(error) });
			});
		}
		return failed;
	}

	/**
	 * Applies `change` to a heat pump and records the state MELCloud answers with.
	 *
	 * @throws When `device` isn't a heat pump or MELCloud rejects the change.
	 */
	async climate(device: DeviceDTO, change: ClimateChange): Promise<void> {
		if (device.kind === "esphome-climate") {
			device.saveState(await espHome.apply(device, change));
			return;
		}
		if (device.kind !== "melcloud-ata" && device.kind !== "melcloud-atw") {
			throw new Error("That device is not a heat pump.");
		}
		device.saveState(await melCloud.apply(device, change));
	}

	/**
	 * Pauses, resumes or stops a print, turns the chamber light on or off, or sets the print speed.
	 *
	 * @throws When `device` isn't a printer, can't be reached, or refuses the command.
	 */
	async printer(device: DeviceDTO, change: PrinterChange): Promise<void> {
		if (device.kind !== "bambu-printer") {
			throw new Error("That device is not a printer.");
		}
		if (change.command) {
			await bambuPrinters.send(device, {
				print: { command: change.command, param: "" },
			});
		}
		if (change.light !== undefined) {
			await bambuPrinters.send(device, {
				system: {
					command: "ledctrl",
					led_node: "chamber_light",
					led_mode: change.light ? "on" : "off",
					led_on_time: 500,
					led_off_time: 500,
					loop_times: 1,
					interval_time: 1000,
				},
			});
		}
		if (change.speed) {
			await bambuPrinters.send(device, {
				print: { command: "print_speed", param: String(change.speed) },
			});
		}
	}

	/**
	 * Starts, pauses, stops or docks a robot vacuum, then reads where it's at.
	 *
	 * @throws When `device` isn't a vacuum or Dreame refuses the command.
	 */
	async vacuum(device: DeviceDTO, command: VacuumCommand): Promise<void> {
		if (device.kind !== "dreame-vacuum") {
			throw new Error("That device is not a robot vacuum.");
		}
		await dreameCloud.command(device, command);
		this.#refreshLater(device);
	}

	/**
	 * Sets a radiator valve's target temperature, within what the valve takes; a manual change ends a preset's hold.
	 *
	 * @throws When `device` isn't a valve or the broker can't be reached.
	 */
	async valve(device: DeviceDTO, target: number): Promise<void> {
		const state = device.state;
		if (device.kind !== "zigbee-valve" || state?.type !== "valve") {
			throw new Error("That device is not a radiator valve.");
		}
		const clamped = Math.min(state.max, Math.max(state.min, target));
		await broker.publish(device, { [state.setpoint]: clamped });
		device.saveState({
			...state,
			target: clamped,
			heldBy: null,
			heldTarget: null,
		});
	}

	/**
	 * Turns a relay or plug on or off.
	 *
	 * @throws When `device` isn't a switch or the broker can't be reached.
	 */
	async switchPower(device: DeviceDTO, on: boolean): Promise<void> {
		const state = device.state;
		if (device.kind !== "zigbee-switch" || state?.type !== "switch") {
			throw new Error("That device is not a switch.");
		}
		await broker.publish(device, { state: on ? "ON" : "OFF" });
		device.saveState({ ...state, on });
	}

	/**
	 * Saves what a phone or tablet running the app reported; its last location stays when `report.location` is
	 * `undefined`, and goes when it's `null`.
	 */
	reportApp(device: DeviceDTO, report: AppReport): void {
		const previous = device.state?.type === "app" ? device.state : null;
		const { location, ...rest } = report;
		device.saveState({
			type: "app",
			...rest,
			location:
				location === undefined
					? (previous?.location ?? null)
					: location && { ...location, at: new Date().toISOString() },
		});
	}

	/** A message fit for the page from whatever an integration threw. */
	message(error: unknown): string {
		return error instanceof Error && error.message
			? error.message
			: "The device didn't answer.";
	}

	#read(device: DeviceDTO): Promise<DeviceState> {
		if (device.kind === "tuya-cover") {
			return tuyaCovers.read(device);
		}
		if (device.kind === "dreame-vacuum") {
			return dreameCloud.read(device);
		}
		if (device.kind === "linky") {
			return linky.read(device);
		}
		if (device.kind === "esphome-climate") {
			return espHome.read(device);
		}
		return device.kind === "bambu-printer"
			? bambuPrinters.read(device)
			: melCloud.read(device);
	}

	#assertCover(device: DeviceDTO): void {
		if (device.kind !== "tuya-cover") {
			throw new Error("That device is not a cover.");
		}
	}

	#reportOutage(device: DeviceDTO): void {
		if (
			!device.unreachableUnreported(new Date(Date.now() - unreachableAlertMs))
		) {
			return;
		}
		JobDTO.enqueue("push.send", {
			userIds: UserDTO.adminIds(),
			title: `${device.name} is unreachable`,
			body: "It hasn't answered for an hour. Check its power and network.",
			url: "/admin/devices",
		});
		device.markUnreachableReported();
	}

	#refreshLater(device: DeviceDTO): void {
		JobDTO.enqueue(
			"device.refresh",
			{ deviceId: device.id },
			{ runAt: new Date(Date.now() + coverSettleMs), maxAttempts: 1 },
		);
	}
}

export const devices = new Devices();
