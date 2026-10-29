import { HomeDTO } from "#lib/dto/home.js";
import { automations } from "#lib/server/automations/automations.js";
import { energy } from "#lib/server/house/energy.js";

export const load = async ({ parent }) => {
	const { home } = await parent();
	const found = HomeDTO.find(home.id) ?? HomeDTO.first();
	return { energy: energy.overview(found.id, automations.timeZoneOf(found)) };
};
