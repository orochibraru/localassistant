import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import type {
	EnergyBucket,
	EnergyPreset,
	EnergyRange,
	EnergyReport,
	EnergyUnit,
} from "#lib/energy.js";

const hourMs = 60 * 60_000;
const dayMs = 24 * hourMs;

export type EnergyChoice =
	{ preset: EnergyPreset } | { month: string } | { from: string; to: string };

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
		const metered = DeviceDTO.inHome(homeId).filter(
			(device) =>
				device.kind === "zigbee-meter" ||
				device.kind === "shelly-meter" ||
				device.kind === "linky" ||
				(device.state?.type === "switch" && device.state.energy !== null),
		);
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
		const series = metered.map((device) => {
			const own = readings.filter((reading) => reading.deviceId === device.id);
			return {
				device,
				buckets: this.#buckets(own, keys, timeZone, range.unit),
				before: this.#sum(
					this.#buckets(
						own,
						this.#days(before.from, before.to),
						timeZone,
						"day",
					),
				),
			};
		});
		const wholeHouse = (kind: string) =>
			kind === "zigbee-meter" || kind === "linky";
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
		const elapsed = span.filter((day) => day <= today).length;
		const past = buckets.filter((bucket) => bucket.key.slice(0, 10) <= today);
		const byValue = (first: EnergyBucket, second: EnergyBucket) =>
			first.kilowattHours - second.kilowattHours;
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
				averagePerDay: elapsed > 0 ? this.#round(total / elapsed) : 0,
				peak: past.toSorted(byValue).at(-1) ?? null,
				lowest:
					range.unit === "day" ? (past.toSorted(byValue)[0] ?? null) : null,
				projection:
					elapsed > 0 && elapsed < span.length
						? this.#round((total / elapsed) * span.length)
						: null,
			},
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

	/** The dates and bar size a preset, a month or a custom span covers, given the local `today` and the first reading. */
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

	#unitFor(from: string, to: string): EnergyUnit {
		const length = this.#days(from, to).length;
		if (length <= 3) {
			return "hour";
		}
		return length <= 93 ? "day" : "month";
	}

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

	#months(from: string, to: string): string[] {
		return [
			...new Set(this.#days(from, to).map((day) => day.slice(0, 7))),
		].toReversed();
	}

	#days(from: string, to: string): string[] {
		const days: string[] = [];
		for (let day = from; day <= to && days.length < 4000;) {
			days.push(day);
			day = this.#shift(day, 1);
		}
		return days;
	}

	#shift(day: string, by: number): string {
		return new Date(Date.parse(`${day}T00:00:00Z`) + by * dayMs)
			.toISOString()
			.slice(0, 10);
	}

	#monthsBefore(month: string, count: number): string {
		const [year = 0, number = 1] = month.split("-").map(Number);
		return new Date(Date.UTC(year, number - 1 - count, 1))
			.toISOString()
			.slice(0, 7);
	}

	#monthEnd(month: string): string {
		const [year = 0, number = 1] = month.split("-").map(Number);
		return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
	}

	#sum(buckets: EnergyBucket[]): number {
		return this.#round(
			buckets.reduce((total, bucket) => total + bucket.kilowattHours, 0),
		);
	}

	#round(value: number): number {
		return Math.round(value * 100) / 100;
	}

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
