import { and, asc, gte, inArray, lt } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { energyReading } from "#lib/server/db/schema.js";

export interface EnergyReading {
	deviceId: string;
	hour: Date;
	total: number;
}

/** Hourly snapshots of each meter's energy counter, the source of the energy charts. */
export class EnergyReadingDTO extends BaseDTO<EnergyReading> {
	/** Records `total` (kWh) as the counter of `deviceId` for the hour `hour` starts, replacing an earlier one that hour. */
	static record(deviceId: string, hour: Date, total: number): void {
		databaseConnection
			.get()
			.insert(energyReading)
			.values({ deviceId, hour, total })
			.onConflictDoUpdate({
				target: [energyReading.deviceId, energyReading.hour],
				set: { total },
			})
			.run();
	}

	/** The snapshots of `deviceIds` from `since` on, oldest first. */
	static since(deviceIds: string[], since: Date): EnergyReadingDTO[] {
		if (deviceIds.length === 0) {
			return [];
		}
		return databaseConnection
			.get()
			.select()
			.from(energyReading)
			.where(
				and(
					inArray(energyReading.deviceId, deviceIds),
					gte(energyReading.hour, since),
				),
			)
			.orderBy(asc(energyReading.hour))
			.all()
			.map((row) => new EnergyReadingDTO(row));
	}

	/** Deletes the snapshots older than `before`, returning how many went. */
	static pruneBefore(before: Date): number {
		return databaseConnection
			.get()
			.delete(energyReading)
			.where(lt(energyReading.hour, before))
			.returning({ deviceId: energyReading.deviceId })
			.all().length;
	}
}
