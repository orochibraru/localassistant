import type { LinkyState } from "#lib/devices.js";
import type { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { secrets } from "#lib/server/core/secrets.js";

const apiUrl = "https://conso.boris.sh/api/daily_consumption";
const requestTimeoutMs = 20_000;
const refreshEveryMs = 6 * 60 * 60_000;
const dayMs = 24 * 60 * 60_000;
const windowDays = 365;

interface DailyAnswer {
	interval_reading?: { value: string; date: string }[];
}

/**
 * A Linky meter read online: Enedis's daily consumption through conso.boris.sh, with the PRM and the token its site
 * hands out. No hardware; the data is a day behind.
 */
class Linky {
	/**
	 * Fetches the last year of daily use, stores it as the meter's counter, and returns yesterday's; reuses the last
	 * reading for six hours, Enedis only publishes once a day.
	 *
	 * @throws When the token is refused or the service can't be reached.
	 */
	async read(device: DeviceDTO, now = new Date()): Promise<LinkyState> {
		const { state, stateAt } = device.toJSON();
		if (
			state?.type === "linky" &&
			stateAt &&
			now.getTime() - stateAt.getTime() < refreshEveryMs
		) {
			return state;
		}
		const days = await this.#fetch(device, now);
		const start = days[0];
		if (!start) {
			return { type: "linky", day: null, kilowattHours: null };
		}
		const before = EnergyReadingDTO.since([device.id], new Date(0))
			.map((reading) => reading.toJSON())
			.filter((reading) => reading.hour < this.#hourOf(start.date));
		let total = before.at(-1)?.total ?? 0;
		for (const day of days) {
			total += day.kilowattHours;
			EnergyReadingDTO.record(
				device.id,
				this.#hourOf(day.date),
				Math.round(total * 1000) / 1000,
			);
		}
		const last = days.at(-1);
		return {
			type: "linky",
			day: last?.date ?? null,
			kilowattHours: last ? Math.round(last.kilowattHours * 100) / 100 : null,
		};
	}

	#hourOf(date: string): Date {
		return new Date(`${date}T12:00:00Z`);
	}

	async #fetch(
		device: DeviceDTO,
		now: Date,
	): Promise<{ date: string; kilowattHours: number }[]> {
		const encrypted = device.encryptedLocalKey();
		if (!encrypted) {
			throw new Error("This Linky has no token.");
		}
		const day = (offset: number) =>
			new Date(now.getTime() - offset * dayMs).toISOString().slice(0, 10);
		const query = new URLSearchParams({
			prm: device.externalId,
			start: day(windowDays),
			end: day(0),
		});
		let response: Response;
		try {
			response = await fetch(`${apiUrl}?${query}`, {
				headers: {
					Authorization: `Bearer ${secrets.decrypt(encrypted)}`,
					"User-Agent": "LocalAssistant",
				},
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
		} catch (error) {
			throw new Error("conso.boris.sh can't be reached right now.", {
				cause: error,
			});
		}
		if (response.status === 401 || response.status === 403) {
			throw new Error(
				"conso.boris.sh refused the token: get a new one for this PRM.",
			);
		}
		if (!response.ok) {
			throw new Error(`conso.boris.sh answered ${response.status}.`);
		}
		const body = (await response.json()) as DailyAnswer;
		return (body.interval_reading ?? [])
			.map((reading) => ({
				date: reading.date.slice(0, 10),
				kilowattHours: Number(reading.value) / 1000,
			}))
			.filter((reading) => Number.isFinite(reading.kilowattHours))
			.toSorted((first, second) => first.date.localeCompare(second.date));
	}
}

export const linky = new Linky();
