import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";

const hourMs = 60 * 60_000;
const dayMs = 24 * hourMs;

export type EnergyPeriod = "day" | "month";

export interface EnergyBucket {
	key: string;
	kilowattHours: number;
}

export interface EnergySeries {
	deviceId: string;
	name: string;
	kind: string;
	days: EnergyBucket[];
	months: EnergyBucket[];
}

export interface EnergyOverview {
	house: { days: EnergyBucket[]; months: EnergyBucket[]; metered: boolean };
	appliances: EnergySeries[];
}

/** The household's energy use: hourly counter snapshots of every meter, summed into days and months. */
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

	/** Each metered device of `homeId`, with what it used on each of the last 30 days and 12 months in `timeZone`. */
	series(homeId: string, timeZone: string, now = new Date()): EnergySeries[] {
		const metered = DeviceDTO.inHome(homeId).filter(
			(device) =>
				device.kind === "zigbee-meter" ||
				device.kind === "shelly-meter" ||
				device.kind === "linky" ||
				(device.state?.type === "switch" && device.state.energy !== null),
		);
		const days = this.#keys(now, timeZone, "day");
		const months = this.#keys(now, timeZone, "month");
		const readings = EnergyReadingDTO.since(
			metered.map((device) => device.id),
			new Date(now.getTime() - 400 * dayMs),
		).map((reading) => reading.toJSON());
		return metered.map((device) => {
			const own = readings.filter((reading) => reading.deviceId === device.id);
			return {
				deviceId: device.id,
				name: device.toJSON().name,
				kind: device.kind,
				days: this.#buckets(own, days, timeZone, "day"),
				months: this.#buckets(own, months, timeZone, "month"),
			};
		});
	}

	/**
	 * The house's use and each appliance's: the house is its whole-house meters (the Linky reader) when it has one, the
	 * sum of the appliances otherwise.
	 */
	overview(homeId: string, timeZone: string, now = new Date()): EnergyOverview {
		const all = this.series(homeId, timeZone, now);
		const wholeHouse = (series: EnergySeries) =>
			series.kind === "zigbee-meter" || series.kind === "linky";
		const meters = all.filter(wholeHouse);
		const appliances = all.filter((series) => !wholeHouse(series));
		const source = meters.length > 0 ? meters : appliances;
		const sum = (pick: (series: EnergySeries) => EnergyBucket[]) =>
			(source[0] ? pick(source[0]) : []).map((bucket, index) => ({
				key: bucket.key,
				kilowattHours:
					Math.round(
						source.reduce(
							(total, series) =>
								total + (pick(series)[index]?.kilowattHours ?? 0),
							0,
						) * 100,
					) / 100,
			}));
		return {
			house: {
				days: sum((series) => series.days),
				months: sum((series) => series.months),
				metered: meters.length > 0,
			},
			appliances,
		};
	}

	/** The bucket an instant falls in: "2026-10-28" for a day, "2026-10" for a month, in `timeZone`. */
	bucketOf(instant: Date, timeZone: string, period: EnergyPeriod): string {
		const day = new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(instant);
		return period === "day" ? day : day.slice(0, 7);
	}

	#keys(now: Date, timeZone: string, period: EnergyPeriod): string[] {
		const keys = new Set<string>();
		const count = period === "day" ? 30 : 12;
		for (let step = 0; keys.size < count && step < 400; step += 1) {
			keys.add(
				this.bucketOf(new Date(now.getTime() - step * dayMs), timeZone, period),
			);
		}
		return [...keys].toReversed();
	}

	#buckets(
		readings: { hour: Date; total: number }[],
		keys: string[],
		timeZone: string,
		period: EnergyPeriod,
	): EnergyBucket[] {
		const used = new Map(keys.map((key) => [key, 0]));
		for (let index = 1; index < readings.length; index += 1) {
			const current = readings[index];
			const previous = readings[index - 1];
			if (!current || !previous || current.total < previous.total) {
				continue;
			}
			const key = this.bucketOf(current.hour, timeZone, period);
			const sum = used.get(key);
			if (sum !== undefined) {
				used.set(key, sum + current.total - previous.total);
			}
		}
		return keys.map((key) => ({
			key,
			kilowattHours: Math.round((used.get(key) ?? 0) * 100) / 100,
		}));
	}
}

export const energy = new Energy();
