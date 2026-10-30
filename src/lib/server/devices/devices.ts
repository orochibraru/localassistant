import type { AppReport, CoverAction } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { UserDTO } from "#lib/dto/user.js";
import type { DeviceCommand } from "#lib/plugin-sdk.js";
import { kindInfo } from "#lib/plugins.js";
import { Logger } from "#lib/server/core/logger.js";
import { deviceEvents } from "#lib/server/devices/device-events.js";
import { pluginContexts } from "#lib/server/plugins/context.js";
import { type HostedPlugin, plugins } from "#lib/server/plugins/registry.js";

const logger = new Logger("Devices");

const unreachableAlertMs = 60 * 60_000;
const recheckGapMs = 20_000;

const commandNouns: Record<DeviceCommand["type"], string> = {
	cover: "a cover",
	climate: "a heat pump",
	printer: "a printer",
	vacuum: "a robot vacuum",
	valve: "a radiator valve",
	switch: "a switch",
	light: "a light",
	lock: "a lock",
	fan: "a fan",
	media: "a media player",
	button: "a button",
};

/** Reads and drives every device through the plugin that provides its kind. */
class Devices {
	#lastRecheckAt = 0;

	/**
	 * Reads `device` through its plugin and records its state, or why it couldn't be read, telling the admins once when
	 * it has been unreachable for an hour; devices whose plugin pushes their state are left alone. Never throws.
	 */
	async refresh(device: DeviceDTO): Promise<void> {
		if (device.kind === "app") {
			return;
		}
		const hosted = plugins.forKind(device.kind);
		if (!hosted) {
			device.saveError("Its integration isn't installed anymore.");
			return;
		}
		if (!plugins.enabled(hosted.manifest.id)) {
			device.saveError("Its integration is turned off.");
			return;
		}
		if (!hosted.plugin.read) {
			return;
		}
		try {
			deviceEvents.save(
				device,
				await hosted.plugin.read(pluginContexts.device(device), hosted.context),
			);
		} catch (error) {
			logger.warn("Device read failed", { device: device.id }, error);
			device.saveError(this.message(error));
			this.#reportOutage(device);
		}
	}

	/** Whether `device` is down: unreachable, failing to read, or reported offline by its cloud. */
	isOffline(device: DeviceDTO): boolean {
		const { stateError, unreachableSince } = device.toJSON();
		const state = device.state as { offline?: unknown } | null;
		return (
			unreachableSince !== null ||
			stateError !== null ||
			state?.offline === true
		);
	}

	/**
	 * Has the worker read every offline device again now, at most once every 20 seconds whoever asks; returns how many
	 * are offline and whether a recheck was queued.
	 */
	recheckOffline(now = Date.now()): { offline: number; queued: boolean } {
		const offline = DeviceDTO.all().filter((device) => this.isOffline(device));
		if (offline.length === 0 || now - this.#lastRecheckAt < recheckGapMs) {
			return { offline: offline.length, queued: false };
		}
		this.#lastRecheckAt = now;
		for (const device of offline) {
			JobDTO.enqueue(
				"device.refresh",
				{ deviceId: device.id },
				{ maxAttempts: 1 },
			);
		}
		return { offline: offline.length, queued: true };
	}

	/** Refreshes every device one after the other, so no cloud sees a burst; never throws. */
	async refreshAll(): Promise<number> {
		const all = DeviceDTO.all();
		for (const device of all) {
			await this.refresh(device);
		}
		return all.length;
	}

	/**
	 * Sends `command` to `device` through its plugin and records the state it answers with; a radiator valve's target
	 * is kept within what it takes, and a manual change ends a routine's hold on it.
	 *
	 * @throws When `device` can't take that command, its plugin is off or gone, or the device refuses it.
	 */
	async command(device: DeviceDTO, command: DeviceCommand): Promise<void> {
		const hosted = this.#controller(device, command);
		const state = device.state;
		const sent =
			command.type === "valve" && state?.type === "valve"
				? {
						...command,
						target: Math.min(state.max, Math.max(state.min, command.target)),
					}
				: command;
		const answer = await hosted.plugin.command?.(
			pluginContexts.device(device),
			sent,
			hosted.context,
		);
		const next = answer ?? (state ? this.#assumed(state, sent) : null);
		if (next?.type === "valve") {
			deviceEvents.save(device, { ...next, heldBy: null, heldTarget: null });
		} else if (next) {
			deviceEvents.save(device, next);
		}
	}

	/** Opens, closes or stops every cover in `covers` one after the other; returns the ones that failed and why. */
	async coverGroup(
		covers: DeviceDTO[],
		action: CoverAction,
	): Promise<{ name: string; error: string }[]> {
		const catalog = plugins.catalog();
		const failed: { name: string; error: string }[] = [];
		for (const cover of covers.filter(
			(device) => kindInfo(catalog, device.kind).card === "cover",
		)) {
			await this.command(cover, { type: "cover", move: { action } }).catch(
				(error: unknown) => {
					failed.push({ name: cover.name, error: this.message(error) });
				},
			);
		}
		return failed;
	}

	/**
	 * Saves what a phone or tablet running the app reported, and has the worker work out again whether its owner is
	 * home; its last location stays when `report.location` is `undefined`, and goes when it's `null`.
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
		if (device.ownerId) {
			JobDTO.enqueue(
				"presence.update",
				{ userId: device.ownerId },
				{ maxAttempts: 1 },
			);
		}
	}

	/** A message fit for the page from whatever a plugin threw. */
	message(error: unknown): string {
		return error instanceof Error && error.message
			? error.message
			: "The device didn't answer.";
	}

	#controller(device: DeviceDTO, command: DeviceCommand): HostedPlugin {
		const hosted = plugins.forKind(device.kind);
		if (
			!hosted?.plugin.command ||
			kindInfo(plugins.catalog(), device.kind).card !== command.type
		) {
			throw new Error(`That device is not ${commandNouns[command.type]}.`);
		}
		if (!plugins.enabled(hosted.manifest.id)) {
			throw new Error("Its integration is turned off.");
		}
		return hosted;
	}

	#assumed(
		state: NonNullable<DeviceDTO["state"]>,
		command: DeviceCommand,
	): NonNullable<DeviceDTO["state"]> | null {
		if (command.type === "valve" && state.type === "valve") {
			return { ...state, target: command.target };
		}
		if (command.type === "switch" && state.type === "switch") {
			return { ...state, on: command.on };
		}
		if (command.type === "light" && state.type === "light") {
			return { ...state, ...command.change };
		}
		if (command.type === "lock" && state.type === "lock") {
			return { ...state, locked: command.locked, jammed: false };
		}
		if (command.type === "fan" && state.type === "fan") {
			return { ...state, ...command.change };
		}
		if (command.type === "media" && state.type === "media") {
			const { action, ...rest } = command.change;
			const playback =
				action === "play"
					? "playing"
					: action === "pause"
						? "paused"
						: action === "stop"
							? "idle"
							: state.playback;
			return { ...state, ...rest, playback };
		}
		if (command.type === "button" && state.type === "button") {
			return { ...state, pressedAt: new Date().toISOString() };
		}
		return null;
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
			url: "/devices",
		});
		device.markUnreachableReported();
	}
}

export const devices = new Devices();
