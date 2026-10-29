import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import type { LogbookLine } from "#lib/history.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { logbookEntry } from "#lib/server/db/schema.js";

const columns = {
	id: logbookEntry.id,
	deviceId: logbookEntry.deviceId,
	name: logbookEntry.name,
	message: logbookEntry.message,
	at: logbookEntry.at,
};

/** What happened in the house, in words, newest first; there's no row object, only finders. */
export class LogbookEntryDTO {
	/** Writes a line: `name` (a device, a person or a routine) did `message`, in `homeId` or the whole household. */
	static add(entry: {
		homeId: string | null;
		deviceId?: string | null;
		name: string;
		message: string;
		at?: Date;
	}): void {
		databaseConnection
			.get()
			.insert(logbookEntry)
			.values({
				homeId: entry.homeId,
				deviceId: entry.deviceId ?? null,
				name: entry.name,
				message: entry.message,
				at: entry.at ?? new Date(),
			})
			.run();
	}

	/** The latest `limit` lines of `homeId` and the whole household, older than the line `before` when given. */
	static recent(homeId: string, limit = 100, before?: number): LogbookLine[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(logbookEntry)
			.where(
				and(
					or(eq(logbookEntry.homeId, homeId), isNull(logbookEntry.homeId)),
					before === undefined ? undefined : lt(logbookEntry.id, before),
				),
			)
			.orderBy(desc(logbookEntry.id))
			.limit(limit)
			.all();
	}

	/** The latest `limit` lines about `deviceId`. */
	static forDevice(deviceId: string, limit = 20): LogbookLine[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(logbookEntry)
			.where(eq(logbookEntry.deviceId, deviceId))
			.orderBy(desc(logbookEntry.id))
			.limit(limit)
			.all();
	}

	/** Removes lines written before `before`; returns how many went. */
	static pruneBefore(before: Date): number {
		return databaseConnection
			.get()
			.delete(logbookEntry)
			.where(lt(logbookEntry.at, before))
			.returning({ id: logbookEntry.id })
			.all().length;
	}
}
