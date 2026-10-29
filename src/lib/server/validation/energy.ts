import { z } from "zod";

import { energyPresets, energySeasons } from "#lib/energy.js";
import type { EnergyChoice } from "#lib/server/house/energy.js";

const day = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

export const energyRangeSchema = z
	.object({
		range: z.string().max(20).optional(),
		from: day.optional(),
		to: day.optional(),
	})
	.transform((query): EnergyChoice => {
		if (query.from && query.to) {
			return { from: query.from, to: query.to };
		}
		const month = /^month:(\d{4}-(0[1-9]|1[0-2]))$/.exec(
			query.range ?? "",
		)?.[1];
		if (month) {
			return { month };
		}
		const season = energySeasons.find(
			(entry) => query.range === `season:${entry}`,
		);
		if (season) {
			return { season };
		}
		return {
			preset:
				energyPresets.find((preset) => preset === query.range) ?? "this-month",
		};
	});
