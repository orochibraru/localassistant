import {
	type AutomationAction,
	inPeriod,
	type Trigger,
} from "#lib/automations.js";
import type { DeviceState } from "#lib/devices.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { kindInfo } from "#lib/plugins.js";
import { Logger } from "#lib/server/core/logger.js";
import { devices } from "#lib/server/devices/devices.js";
import { plugins } from "#lib/server/plugins/registry.js";

const logger = new Logger("Automations");

const longestCatchUpMs = 5 * 60_000;
const temperatureHysteresis = 1;

interface LocalDate {
	year: number;
	month: number;
	day: number;
	weekday: number;
}

export interface Check {
	due: boolean;
	memory: Record<string, unknown> | null;
}

/** Runs each home's automations: the worker checks them every minute and acts on the devices when one is due. */
class Automations {
	/** Checks every enabled automation against the minute that just went by and runs the due ones; never throws. */
	async tick(all: AutomationDTO[], now = new Date()): Promise<number> {
		let ran = 0;
		const homes = new Map(HomeDTO.all().map((home) => [home.id, home]));
		for (const automation of all) {
			const home = homes.get(automation.homeId);
			if (!automation.enabled || !home) {
				continue;
			}
			const since = new Date(
				Math.max(
					automation.checkedAt?.getTime() ?? now.getTime() - 60_000,
					now.getTime() - longestCatchUpMs,
				),
			);
			const check = this.check(automation, home, since, now);
			automation.recordCheck(now, check.memory);
			if (check.due) {
				await this.run(automation);
				ran += 1;
			}
		}
		return ran;
	}

	/** Whether `automation` is due between `since` (excluded) and `now` (included), and what its trigger remembers next. */
	check(
		automation: AutomationDTO,
		home: HomeDTO,
		since: Date,
		now: Date,
	): Check {
		const timeZone = this.timeZoneOf(home);
		const fired = this.#fires(automation, home, { since, now, timeZone });
		return {
			due:
				fired.due && inPeriod(automation.period, this.#monthDay(now, timeZone)),
			memory: fired.memory,
		};
	}

	/**
	 * Runs the automations a door or window sensor triggers: their steps when it opens, and their radiator valves back to
	 * where they were once every one of their sensors in its room is shut. Never throws.
	 */
	async onContact(sensor: DeviceDTO, next: DeviceState): Promise<void> {
		const { homeId, roomId, name } = sensor.toJSON();
		const home = homeId ? HomeDTO.find(homeId) : undefined;
		if (next.type !== "contact" || next.open === null || !home) {
			return;
		}
		const monthDay = this.#monthDay(new Date(), this.timeZoneOf(home));
		for (const automation of AutomationDTO.inHome(home.id)) {
			const trigger = automation.trigger;
			if (
				!automation.enabled ||
				trigger.type !== "contact" ||
				!trigger.deviceIds.includes(sensor.id)
			) {
				continue;
			}
			if (next.open) {
				if (inPeriod(automation.period, monthDay)) {
					await this.run(automation, { roomId, by: name });
				}
				continue;
			}
			const room = this.#around(home.id, roomId);
			const anyOpen = room.some(
				(device) =>
					trigger.deviceIds.includes(device.id) &&
					device.state?.type === "contact" &&
					device.state.open,
			);
			if (anyOpen) {
				continue;
			}
			for (const action of automation.actions) {
				if (action.type === "valves") {
					await this.#release(
						room.filter((device) => action.deviceIds.includes(device.id)),
					);
				}
				if (action.type === "heating") {
					await this.#raise(
						automation,
						room.filter((device) => action.deviceIds.includes(device.id)),
					);
				}
			}
		}
	}

	/**
	 * Runs every action of `automation` one after the other, recording what failed; radiator valves close in the room of
	 * the sensor that `opened`, or everywhere when run by hand. Never throws.
	 */
	async run(
		automation: AutomationDTO,
		opened?: { roomId: string | null; by: string },
	): Promise<void> {
		const failures: string[] = [];
		for (const action of automation.actions) {
			const scope = () =>
				this.#around(automation.homeId, opened?.roomId ?? null).filter(
					(device) =>
						"deviceIds" in action && action.deviceIds.includes(device.id),
				);
			const failed =
				action.type === "valves"
					? await this.#hold(scope(), opened?.by ?? automation.name)
					: action.type === "heating"
						? await this.#lower(automation, scope(), action.degrees)
						: await this.#act(automation.homeId, action);
			failures.push(...failed);
		}
		automation.recordRun(failures.length > 0 ? failures.join(" ") : null);
		logger.info("Automation ran", {
			automation: automation.id,
			failures: failures.length,
		});
	}

	/** The time zone the home's clock follows: its location's, or the server's before one is set. */
	timeZoneOf(home: HomeDTO): string {
		return (
			home.location?.timezone ??
			Intl.DateTimeFormat().resolvedOptions().timeZone
		);
	}

	/** The calendar date `instant` falls on in `timeZone`, with its weekday (0 is Monday). */
	localDate(instant: Date, timeZone: string): LocalDate {
		const parts = this.#parts(instant, timeZone);
		return {
			year: parts.year,
			month: parts.month,
			day: parts.day,
			weekday:
				(new Date(
					Date.UTC(parts.year, parts.month - 1, parts.day),
				).getUTCDay() +
					6) %
				7,
		};
	}

	/** The instant the clocks in `timeZone` show `time` ("HH:MM") on `date`. */
	zonedInstant(date: LocalDate, time: string, timeZone: string): Date {
		const [hour = 0, minute = 0] = time.split(":").map(Number);
		const wall = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
		let instant = wall - this.#offset(new Date(wall), timeZone);
		instant = wall - this.#offset(new Date(instant), timeZone);
		return new Date(instant);
	}

	#fires(
		automation: AutomationDTO,
		home: HomeDTO,
		{ since, now, timeZone }: { since: Date; now: Date; timeZone: string },
	): Check {
		const trigger: Trigger = automation.trigger;
		if (trigger.type === "contact") {
			return { due: false, memory: null };
		}
		const within = (instant: number) =>
			instant > since.getTime() && instant <= now.getTime();
		if (trigger.type === "sun") {
			const due = (home.weather?.days ?? []).some((day) =>
				within(Date.parse(day[trigger.event]) + trigger.offsetMinutes * 60_000),
			);
			return { due, memory: null };
		}
		if (trigger.type === "time") {
			const dates = [
				this.localDate(since, timeZone),
				this.localDate(now, timeZone),
			];
			const due = dates.some(
				(date) =>
					trigger.weekdays.includes(date.weekday) &&
					within(this.zonedInstant(date, trigger.time, timeZone).getTime()),
			);
			return { due, memory: null };
		}
		const temperature = home.weather?.temperature;
		if (temperature === undefined) {
			return { due: false, memory: automation.memory };
		}
		const above = trigger.direction === "above";
		const wasPast = automation.memory?.past;
		const past =
			wasPast === true
				? above
					? temperature > trigger.threshold - temperatureHysteresis
					: temperature < trigger.threshold + temperatureHysteresis
				: above
					? temperature >= trigger.threshold
					: temperature <= trigger.threshold;
		return { due: wasPast === false && past, memory: { past } };
	}

	#monthDay(instant: Date, timeZone: string): string {
		const today = this.localDate(instant, timeZone);
		return `${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
	}

	#around(homeId: string, roomId: string | null): DeviceDTO[] {
		return roomId === null
			? DeviceDTO.inHome(homeId)
			: DeviceDTO.inRoom(homeId, roomId);
	}

	async #hold(valves: DeviceDTO[], by: string): Promise<string[]> {
		const failures: string[] = [];
		for (const valve of valves) {
			const state = valve.state;
			if (state?.type !== "valve" || state.heldBy) {
				continue;
			}
			try {
				await devices.command(valve, { type: "valve", target: state.min });
				valve.saveState({
					...state,
					heldBy: by,
					heldTarget: state.target,
					target: state.min,
				});
			} catch (error) {
				failures.push(`${valve.toJSON().name}: ${devices.message(error)}`);
			}
		}
		return failures;
	}

	async #release(valves: DeviceDTO[]): Promise<void> {
		for (const valve of valves) {
			const state = valve.state;
			if (state?.type !== "valve" || !state.heldBy) {
				continue;
			}
			const target = state.heldTarget ?? state.target ?? state.min;
			try {
				await devices.command(valve, { type: "valve", target });
			} catch (error) {
				logger.warn("Valve didn't go back", { valve: valve.id }, error);
			}
		}
	}

	#lowered(automation: AutomationDTO): Record<string, number> {
		const lowered = automation.memory?.lowered;
		return lowered && typeof lowered === "object"
			? { ...(lowered as Record<string, number>) }
			: {};
	}

	async #setTarget(device: DeviceDTO, target: number): Promise<void> {
		const state = device.state;
		if (state?.type === "climate") {
			await devices.command(device, {
				type: "climate",
				change: { targetTemperature: target },
			});
			return;
		}
		if (state?.type === "valve") {
			await devices.command(device, { type: "valve", target });
			device.saveState({
				...state,
				target,
				heldBy: state.heldBy,
				heldTarget: state.heldTarget,
			});
		}
	}

	async #lower(
		automation: AutomationDTO,
		heaters: DeviceDTO[],
		degrees: number,
	): Promise<string[]> {
		const lowered = this.#lowered(automation);
		const failures: string[] = [];
		for (const heater of heaters) {
			const state = heater.state;
			const target =
				state?.type === "climate"
					? state.targetTemperature
					: state?.type === "valve"
						? state.target
						: null;
			if (target === null || heater.id in lowered) {
				continue;
			}
			const floor =
				state?.type === "climate"
					? state.minTemperature
					: state?.type === "valve"
						? state.min
						: 5;
			try {
				await this.#setTarget(heater, Math.max(floor, target - degrees));
				lowered[heater.id] = target;
			} catch (error) {
				failures.push(`${heater.toJSON().name}: ${devices.message(error)}`);
			}
		}
		automation.remember({ ...automation.memory, lowered });
		return failures;
	}

	async #raise(automation: AutomationDTO, heaters: DeviceDTO[]): Promise<void> {
		const lowered = this.#lowered(automation);
		for (const heater of heaters) {
			const target = lowered[heater.id];
			if (target === undefined) {
				continue;
			}
			try {
				await this.#setTarget(heater, target);
				delete lowered[heater.id];
			} catch (error) {
				logger.warn("Heater didn't go back", { heater: heater.id }, error);
			}
		}
		automation.remember({ ...automation.memory, lowered });
	}

	async #act(
		homeId: string,
		action: Exclude<AutomationAction, { type: "valves" | "heating" }>,
	): Promise<string[]> {
		const targets =
			action.type === "blinds"
				? DeviceDTO.inHome(homeId).filter(
						(device) =>
							kindInfo(plugins.catalog(), device.kind).card === "cover" &&
							(action.roomId === null ||
								device.toJSON().roomId === action.roomId),
					)
				: [DeviceDTO.find(action.deviceId, homeId)].filter(
						(device) => device !== undefined,
					);
		if (targets.length === 0) {
			return [
				action.type === "blinds"
					? "No blind to move."
					: "A device it drives is gone.",
			];
		}
		const failures: string[] = [];
		for (const device of targets) {
			try {
				await this.#apply(device, action);
			} catch (error) {
				failures.push(`${device.toJSON().name}: ${devices.message(error)}`);
			}
		}
		return failures;
	}

	#apply(
		device: DeviceDTO,
		action: Exclude<AutomationAction, { type: "valves" | "heating" }>,
	): Promise<void> {
		if (action.type === "blinds") {
			return devices.command(device, {
				type: "cover",
				move:
					action.move === "position"
						? { position: action.position ?? 50 }
						: { action: action.move },
			});
		}
		if (action.type === "climate") {
			return devices.command(device, {
				type: "climate",
				change: {
					power: action.power,
					...(action.mode ? { mode: action.mode } : {}),
					...(action.targetTemperature === null
						? {}
						: { targetTemperature: action.targetTemperature }),
				},
			});
		}
		return action.type === "printer"
			? devices.command(device, {
					type: "printer",
					change: { command: action.command },
				})
			: devices.command(device, {
					type: "vacuum",
					change: { command: action.command },
				});
	}

	#parts(instant: Date, timeZone: string) {
		const values = Object.fromEntries(
			new Intl.DateTimeFormat("en-GB", {
				timeZone,
				year: "numeric",
				month: "numeric",
				day: "numeric",
				hour: "numeric",
				minute: "numeric",
				second: "numeric",
				hourCycle: "h23",
			})
				.formatToParts(instant)
				.filter((part) => part.type !== "literal")
				.map((part) => [part.type, Number(part.value)]),
		) as Record<
			"year" | "month" | "day" | "hour" | "minute" | "second",
			number
		>;
		return values;
	}

	#offset(instant: Date, timeZone: string): number {
		const parts = this.#parts(instant, timeZone);
		const wall = Date.UTC(
			parts.year,
			parts.month - 1,
			parts.day,
			parts.hour,
			parts.minute,
			parts.second,
		);
		return wall - Math.floor(instant.getTime() / 1000) * 1000;
	}
}

export const automations = new Automations();
