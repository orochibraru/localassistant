import { HomeDTO } from "#lib/dto/home.js";
import { automations } from "#lib/server/automations/automations.js";
import { energy } from "#lib/server/house/energy.js";
import { energyRangeSchema } from "#lib/server/validation/energy.js";

export const load = async ({ parent, url }) => {
	const { home } = await parent();
	const found = HomeDTO.find(home.id) ?? HomeDTO.first();
	const parsed = energyRangeSchema.safeParse(
		Object.fromEntries(url.searchParams),
	);
	return {
		energy: energy.report(
			found.id,
			automations.timeZoneOf(found),
			parsed.success ? parsed.data : { preset: "this-month" },
		),
	};
};
