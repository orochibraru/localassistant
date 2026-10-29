import {
	type AutomationAction,
	inPeriod,
	type Trigger,
} from "#lib/automations.js";
import type { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { Logger } from "#lib/server/core/logger.js";
import { devices } from "#lib/server/devices/devices.js";

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
		const today = this.localDate(now, timeZone);
		const monthDay = `${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
		const fired = this.#fires(automation, home, { since, now, timeZone });
		return {
			due: fired.due && inPeriod(automation.period, monthDay),
			memory: fired.memory,
		};
	}

	/** Runs every action of `automation` one after the other, recording what failed; never throws. */
	async run(automation: AutomationDTO): Promise<void> {
		const failures: string[] = [];
		for (const action of automation.actions) {
			for (const failure of await this.#act(automation.homeId, action)) {
				failures.push(failure);
			}
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

	async #act(homeId: string, action: AutomationAction): Promise<string[]> {
		const targets =
			action.type === "blinds"
				? DeviceDTO.inHome(homeId).filter(
						(device) =>
							device.kind === "tuya-cover" &&
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

	#apply(device: DeviceDTO, action: AutomationAction): Promise<void> {
		if (action.type === "blinds") {
			return action.move === "position"
				? devices.coverPosition(device, action.position ?? 50)
				: devices.coverAction(device, action.move);
		}
		if (action.type === "climate") {
			return devices.climate(device, {
				power: action.power,
				...(action.mode ? { mode: action.mode } : {}),
				...(action.targetTemperature === null
					? {}
					: { targetTemperature: action.targetTemperature }),
			});
		}
		return action.type === "printer"
			? devices.printer(device, { command: action.command })
			: devices.vacuum(device, action.command);
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
