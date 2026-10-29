import { and, asc, eq, gte, lt } from "drizzle-orm";

import type { HistoryPoint } from "#lib/history.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { deviceSample } from "#lib/server/db/schema.js";

/** The numbers a device reported over time, for its history graph; there's no row object, only finders. */
export class DeviceSampleDTO {
	/** Records that `deviceId` read `value` at `at`. */
	static record(deviceId: string, value: number, at = new Date()): void {
		databaseConnection
			.get()
			.insert(deviceSample)
			.values({ deviceId, value, at })
			.run();
	}

	/** What `deviceId` read since `since`, oldest first. */
	static since(deviceId: string, since: Date): HistoryPoint[] {
		return databaseConnection
			.get()
			.select({ at: deviceSample.at, value: deviceSample.value })
			.from(deviceSample)
			.where(
				and(eq(deviceSample.deviceId, deviceId), gte(deviceSample.at, since)),
			)
			.orderBy(asc(deviceSample.at))
			.all();
	}

	/** Removes what was read before `before`; returns how many went. */
	static pruneBefore(before: Date): number {
		return databaseConnection
			.get()
			.delete(deviceSample)
			.where(lt(deviceSample.at, before))
			.returning({ id: deviceSample.id })
			.all().length;
	}
}
