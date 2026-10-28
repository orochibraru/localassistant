import type { ClimateChange, CoverAction, DeviceState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { UserDTO } from "#lib/dto/user.js";
import { Logger } from "#lib/server/core/logger.js";
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
		try {
			device.saveState(await this.#read(device));
		} catch (error) {
			logger.warn("Device read failed", { device: device.id }, error);
			device.saveError(this.message(error));
			this.#reportOutage(device);
		}
	}

	/** Refreshes every device one after the other, so MELCloud never sees a burst; never throws. */
	async refreshAll(): Promise<number> {
		const all = DeviceDTO.all();
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

	/**
	 * Applies `change` to a heat pump and records the state MELCloud answers with.
	 *
	 * @throws When `device` isn't a heat pump or MELCloud rejects the change.
	 */
	async climate(device: DeviceDTO, change: ClimateChange): Promise<void> {
		if (device.kind === "tuya-cover") {
			throw new Error("That device is not a heat pump.");
		}
		device.saveState(await melCloud.apply(device, change));
	}

	/** A message fit for the page from whatever an integration threw. */
	message(error: unknown): string {
		return error instanceof Error && error.message
			? error.message
			: "The device didn't answer.";
	}

	#read(device: DeviceDTO): Promise<DeviceState> {
		return device.kind === "tuya-cover"
			? tuyaCovers.read(device)
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
