import { readingOf } from "#lib/automations.js";
import type { DeviceState } from "#lib/devices.js";
import { DeviceSampleDTO } from "#lib/dto/device-sample.js";
import type { DeviceDTO } from "#lib/dto/device.js";
import { LogbookEntryDTO } from "#lib/dto/logbook-entry.js";
import {
	bucketed,
	describeChange,
	type HistoryPoint,
	type HistoryRange,
	historyRangeHours,
} from "#lib/history.js";

const sampleEveryMs = 60_000;
const sampleAnywayMs = 15 * 60_000;
const graphPoints = 200;

/** Keeps each device's numbers for its graph and writes what changed to the logbook, in the worker. */
class History {
	#last = new Map<string, { at: number; value: number }>();

	/** Records the change of `device` from `previous` to `next`: a sample at most once a minute, and a logbook line. */
	record(
		device: DeviceDTO,
		previous: DeviceState | null,
		next: DeviceState,
		now = Date.now(),
	): void {
		const value = readingOf(next);
		const last = this.#last.get(device.id);
		if (
			value !== null &&
			(!last ||
				(now - last.at >= sampleEveryMs && value !== last.value) ||
				now - last.at >= sampleAnywayMs)
		) {
			DeviceSampleDTO.record(device.id, value, new Date(now));
			this.#last.set(device.id, { at: now, value });
		}
		const message = describeChange(previous, next);
		if (message) {
			const { homeId, name } = device.toJSON();
			LogbookEntryDTO.add({
				homeId,
				deviceId: device.id,
				name,
				message,
				at: new Date(now),
			});
		}
	}

	/** What `deviceId` read over `range`, averaged down to a couple hundred points at most. */
	series(
		deviceId: string,
		range: HistoryRange,
		now = new Date(),
	): HistoryPoint[] {
		const from = new Date(now.getTime() - historyRangeHours[range] * 3_600_000);
		return bucketed(
			DeviceSampleDTO.since(deviceId, from),
			from,
			now,
			graphPoints,
		);
	}
}

export const history = new History();
