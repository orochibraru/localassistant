import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import type {
	EnergyBucket,
	EnergyPreset,
	EnergyRange,
	EnergyReport,
	EnergySeason,
	EnergySummary,
	EnergyUnit,
} from "#lib/energy.js";
import { kindInfo } from "#lib/plugins.js";
import { plugins } from "#lib/server/plugins/registry.js";

const hourMs = 60 * 60_000;
const dayMs = 24 * hourMs;

export type EnergyChoice =
	| { preset: EnergyPreset }
	| { month: string }
	| { season: EnergySeason }
	| { from: string; to: string };

interface Reading {
	hour: Date;
	total: number;
}

/** The household's energy use: hourly counter snapshots of every meter, summed into hours, days and months. */
class Energy {
	/** Snapshots the energy counter of every device that has one, for the current hour. */
	record(now = new Date()): number {
		const hour = new Date(Math.floor(now.getTime() / hourMs) * hourMs);
		let recorded = 0;
		for (const device of DeviceDTO.all()) {
			const state = device.state;
			if (
				(state?.type === "meter" || state?.type === "switch") &&
				state.energy !== null
			) {
				EnergyReadingDTO.record(device.id, hour, state.energy);
				recorded += 1;
			}
		}
		return recorded;
	}

	/**
	 * The house's and each appliance's use over `choice` in `timeZone`, with its total, the same span before, the daily
	 * average, the peak and quietest buckets and where an unfinished period is heading. The house is its whole-house
	 * meters (a Linky) when it has one, the sum of the appliances otherwise.
	 */
	report(
		homeId: string,
		timeZone: string,
		choice: EnergyChoice,
		now = new Date(),
	): EnergyReport {
		const metered = this.#metered(homeId);
		const today = this.bucketOf(now, timeZone, "day");
		const readings = EnergyReadingDTO.since(
			metered.map((device) => device.id),
			new Date(0),
		).map((reading) => reading.toJSON());
		const first = readings[0]
			? this.bucketOf(readings[0].hour, timeZone, "day")
			: null;
		const range = this.resolve(choice, today, first);
		const span = this.#days(range.from, range.to);
		const before = {
			from: this.#shift(range.from, -span.length),
			to: this.#shift(range.from, -1),
		};
		const keys = this.#keys(range);
		const beforeDays = this.#days(before.from, before.to);
		const elapsedDays = span.filter((day) => day <= today);
		const hourKeys = this.#keys({
			key: "",
			from: elapsedDays.slice(-92)[0] ?? today,
			to: elapsedDays.at(-1) ?? today,
			unit: "hour",
		});
		const series = this.#series(metered, readings, timeZone, {
			keys,
			unit: range.unit,
			span,
			beforeDays,
			hourKeys,
		});
		const catalog = plugins.catalog();
		const wholeHouse = (kind: string) => kindInfo(catalog, kind).houseMeter;
		const meters = series.filter(({ device }) => wholeHouse(device.kind));
		const appliances = series.filter(({ device }) => !wholeHouse(device.kind));
		const source = meters.length > 0 ? meters : appliances;
		const buckets = keys.map((key, index) => ({
			key,
			kilowattHours: this.#round(
				source.reduce(
					(total, entry) => total + (entry.buckets[index]?.kilowattHours ?? 0),
					0,
				),
			),
		}));
		const total = this.#sum(buckets);
		const profile = this.#profile(
			{
				daily: this.#summed(source, (entry) => entry.daily, span.length),
				before: this.#summed(source, (entry) => entry.beforeDaily, span.length),
				hourly: source.every((entry) => entry.hourly !== null)
					? this.#summed(source, (entry) => entry.hourly, hourKeys.length)
					: null,
			},
			span,
			today,
		);
		return {
			range,
			today,
			months: first ? this.#months(first, today) : [],
			house: {
				metered: meters.length > 0,
				buckets,
				total,
				previousTotal: this.#round(
					source.reduce((sum, entry) => sum + entry.before, 0),
				),
				...this.#figures(buckets, {
					unit: range.unit,
					today,
					elapsed: elapsedDays.length,
					length: span.length,
				}),
			},
			profile,
			appliances: appliances.map(({ device, buckets: own }) => {
				const used = this.#sum(own);
				return {
					deviceId: device.id,
					name: device.toJSON().name,
					kind: device.kind,
					total: used,
					share: total > 0 ? Math.min(1, used / total) : null,
					buckets: own,
				};
			}),
		};
	}

	/** The devices of `homeId` that count energy. */
	#metered(homeId: string): DeviceDTO[] {
		const catalog = plugins.catalog();
		return DeviceDTO.inHome(homeId).filter((device) => {
			const card = kindInfo(catalog, device.kind).card;
			return (
				card === "meter" ||
				card === "linky" ||
				(device.state?.type === "switch" && device.state.energy !== null)
			);
		});
	}

	/** The bucket-by-bucket sum of what `pick` takes from every entry of `source`. */
	#summed<Entry>(
		source: Entry[],
		pick: (entry: Entry) => EnergyBucket[] | null,
		count: number,
	): number[] {
		return Array.from({ length: count }, (_, index) =>
			source.reduce(
				(sum, entry) => sum + (pick(entry)?.[index]?.kilowattHours ?? 0),
				0,
			),
		);
	}

	/** The daily average, the busiest and quietest buckets up to `today`, and where an unfinished period is heading. */
	#figures(
		buckets: EnergyBucket[],
		{
			unit,
			today,
			elapsed,
			length,
		}: { unit: EnergyUnit; today: string; elapsed: number; length: number },
	) {
		const total = this.#sum(buckets);
		const past = buckets
			.filter((bucket) => bucket.key.slice(0, 10) <= today)
			.toSorted((first, second) => first.kilowattHours - second.kilowattHours);
		return {
			averagePerDay: elapsed > 0 ? this.#round(total / elapsed) : 0,
			peak: past.at(-1) ?? null,
			lowest: unit === "day" ? (past[0] ?? null) : null,
			projection:
				elapsed > 0 && elapsed < length
					? this.#round((total / elapsed) * length)
					: null,
		};
	}

	/** Each metered device's buckets over the range, its days, the days before, and its hours when it reports hourly. */
	#series(
		metered: DeviceDTO[],
		readings: (Reading & { deviceId: string })[],
		timeZone: string,
		spans: {
			keys: string[];
			unit: EnergyUnit;
			span: string[];
			beforeDays: string[];
			hourKeys: string[];
		},
	) {
		return metered.map((device) => {
			const own = readings.filter((reading) => reading.deviceId === device.id);
			const beforeDaily = this.#buckets(own, spans.beforeDays, timeZone, "day");
			return {
				device,
				buckets: this.#buckets(own, spans.keys, timeZone, spans.unit),
				daily: this.#buckets(own, spans.span, timeZone, "day"),
				beforeDaily,
				hourly:
					kindInfo(plugins.catalog(), device.kind).card === "linky"
						? null
						: this.#buckets(own, spans.hourKeys, timeZone, "hour"),
				before: this.#sum(beforeDaily),
			};
		});
	}

	/** The running totals against the span before, the average week, and the average day when the meters report hourly. */
	#profile(
		{
			daily,
			before: beforeDaily,
			hourly,
		}: { daily: number[]; before: number[]; hourly: number[] | null },
		span: string[],
		today: string,
	): EnergyReport["profile"] {
		let running = 0;
		let runningBefore = 0;
		const cumulative = span.map((day, index) => {
			running += daily[index] ?? 0;
			runningBefore += beforeDaily[index] ?? 0;
			return {
				day,
				current: day <= today ? this.#round(running) : null,
				previous: this.#round(runningBefore),
			};
		});
		const weekdays = Array.from({ length: 7 }, (_, weekday) => {
			const values = span.flatMap((day, index) =>
				day <= today &&
				(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7 === weekday
					? [daily[index] ?? 0]
					: [],
			);
			return values.length > 0
				? this.#round(
						values.reduce((sum, value) => sum + value, 0) / values.length,
					)
				: 0;
		});
		const hourDays = (hourly?.length ?? 0) / 24;
		const hours =
			hourly && hourDays > 0
				? Array.from({ length: 24 }, (_, hour) =>
						this.#round(
							hourly
								.filter((_, index) => index % 24 === hour)
								.reduce((sum, value) => sum + value, 0) / hourDays,
						),
					)
				: null;
		return { cumulative, weekdays, hours };
	}

	/** Each Linky of `homeId` with its last 7 days, this month and last month so far, and this month's daily average. */
	summaries(
		homeId: string,
		timeZone: string,
		now = new Date(),
	): Record<string, EnergySummary> {
		const catalog = plugins.catalog();
		const meters = DeviceDTO.inHome(homeId).filter(
			(device) => kindInfo(catalog, device.kind).card === "linky",
		);
		const today = this.bucketOf(now, timeZone, "day");
		const month = today.slice(0, 7);
		const readings = EnergyReadingDTO.since(
			meters.map((device) => device.id),
			new Date(now.getTime() - 70 * dayMs),
		).map((reading) => reading.toJSON());
		const week = this.#days(this.#shift(today, -6), today);
		return Object.fromEntries(
			meters.map((device) => {
				const own = readings.filter(
					(reading) => reading.deviceId === device.id,
				);
				const [thisMonth, lastMonth] = this.#buckets(
					own,
					[month, this.#monthsBefore(month, 1)],
					timeZone,
					"month",
				);
				const used = thisMonth?.kilowattHours ?? 0;
				return [
					device.id,
					{
						days: this.#buckets(own, week, timeZone, "day"),
						thisMonth: used,
						lastMonth: lastMonth?.kilowattHours ?? 0,
						averagePerDay: this.#round(used / Number(today.slice(8))),
					},
				];
			}),
		);
	}

	/** The dates and bar size a preset, a month, the latest of a season or a custom span covers, given the local `today` and the first reading. */
	resolve(
		choice: EnergyChoice,
		today: string,
		first: string | null,
	): EnergyRange {
		if ("month" in choice) {
			return {
				key: `month:${choice.month}`,
				from: `${choice.month}-01`,
				to: this.#monthEnd(choice.month),
				unit: "day",
			};
		}
		if ("season" in choice) {
			const firstMonth = { spring: 3, summer: 6, autumn: 9, winter: 12 }[
				choice.season
			];
			const year = Number(today.slice(0, 4));
			const thisYear = `${year}-${String(firstMonth).padStart(2, "0")}`;
			const start =
				`${thisYear}-01` > today ? `${year - 1}${thisYear.slice(4)}` : thisYear;
			const end = this.#monthsBefore(start, -2);
			return {
				key: `season:${choice.season}`,
				from: `${start}-01`,
				to: this.#monthEnd(end),
				unit: "day",
			};
		}
		if ("from" in choice) {
			const [from, to] = [choice.from, choice.to].toSorted();
			return {
				key: "custom",
				from: from ?? today,
				to: to ?? today,
				unit: this.#unitFor(from ?? today, to ?? today),
			};
		}
		const month = today.slice(0, 7);
		const year = today.slice(0, 4);
		const lastMonth = this.#monthsBefore(month, 1);
		const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
		const spans: Record<EnergyPreset, [string, string, EnergyUnit]> = {
			today: [today, today, "hour"],
			yesterday: [this.#shift(today, -1), this.#shift(today, -1), "hour"],
			"last-3-days": [this.#shift(today, -2), today, "hour"],
			"this-week": [this.#shift(today, -weekday), today, "day"],
			"this-month": [`${month}-01`, this.#monthEnd(month), "day"],
			"last-month": [`${lastMonth}-01`, this.#monthEnd(lastMonth), "day"],
			"last-3-months": [`${this.#monthsBefore(month, 2)}-01`, today, "day"],
			"this-year": [`${year}-01-01`, `${year}-12-31`, "month"],
			"year-to-date": [`${year}-01-01`, today, "month"],
			"all-time": [first ?? today, today, "month"],
		};
		const [from, to, unit] = spans[choice.preset];
		return { key: choice.preset, from, to, unit };
	}

	/** The bucket an instant falls in, in `timeZone`: "2026-10-28 14" for an hour, "2026-10-28" for a day, "2026-10" for a month. */
	bucketOf(instant: Date, timeZone: string, unit: EnergyUnit): string {
		const parts = Object.fromEntries(
			new Intl.DateTimeFormat("en-CA", {
				timeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				hourCycle: "h23",
			})
				.formatToParts(instant)
				.map((part) => [part.type, part.value]),
		);
		const day = `${parts.year}-${parts.month}-${parts.day}`;
		if (unit === "hour") {
			return `${day} ${parts.hour}`;
		}
		return unit === "day" ? day : day.slice(0, 7);
	}

	/** The bar size for a custom span: hours up to 3 days, days up to about 3 months, months beyond. */
	#unitFor(from: string, to: string): EnergyUnit {
		const length = this.#days(from, to).length;
		if (length <= 3) {
			return "hour";
		}
		return length <= 93 ? "day" : "month";
	}

	/** The bucket keys a range covers, in order. */
	#keys(range: EnergyRange): string[] {
		const days = this.#days(range.from, range.to);
		if (range.unit === "hour") {
			return days.flatMap((day) =>
				Array.from(
					{ length: 24 },
					(_, hour) => `${day} ${String(hour).padStart(2, "0")}`,
				),
			);
		}
		return range.unit === "day"
			? days
			: [...new Set(days.map((day) => day.slice(0, 7)))];
	}

	/** Every month from `from` to `to`, latest first. */
	#months(from: string, to: string): string[] {
		return [
			...new Set(this.#days(from, to).map((day) => day.slice(0, 7))),
		].toReversed();
	}

	/** Every day from `from` to `to`, both included. */
	#days(from: string, to: string): string[] {
		const days: string[] = [];
		for (let day = from; day <= to && days.length < 4000;) {
			days.push(day);
			day = this.#shift(day, 1);
		}
		return days;
	}

	/** The day `by` days after `day`. */
	#shift(day: string, by: number): string {
		return new Date(Date.parse(`${day}T00:00:00Z`) + by * dayMs)
			.toISOString()
			.slice(0, 10);
	}

	/** The month `count` months before `month`. */
	#monthsBefore(month: string, count: number): string {
		const [year = 0, number = 1] = month.split("-").map(Number);
		return new Date(Date.UTC(year, number - 1 - count, 1))
			.toISOString()
			.slice(0, 7);
	}

	/** The last day of `month`. */
	#monthEnd(month: string): string {
		const [year = 0, number = 1] = month.split("-").map(Number);
		return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
	}

	/** The total of `buckets`, rounded to the hundredth. */
	#sum(buckets: EnergyBucket[]): number {
		return this.#round(
			buckets.reduce((total, bucket) => total + bucket.kilowattHours, 0),
		);
	}

	/** `value` rounded to the hundredth. */
	#round(value: number): number {
		return Math.round(value * 100) / 100;
	}

	/** What the counter readings added up in each bucket of `keys`, skipping counter resets. */
	#buckets(
		readings: Reading[],
		keys: string[],
		timeZone: string,
		unit: EnergyUnit,
	): EnergyBucket[] {
		const used = new Map(keys.map((key) => [key, 0]));
		for (let index = 1; index < readings.length; index += 1) {
			const current = readings[index];
			const previous = readings[index - 1];
			if (!current || !previous || current.total < previous.total) {
				continue;
			}
			const key = this.bucketOf(current.hour, timeZone, unit);
			const sum = used.get(key);
			if (sum !== undefined) {
				used.set(key, sum + current.total - previous.total);
			}
		}
		return keys.map((key) => ({
			key,
			kilowattHours: this.#round(used.get(key) ?? 0),
		}));
	}
}

export const energy = new Energy();
