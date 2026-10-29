import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { automations } from "#lib/server/automations/automations.js";
import { energy } from "#lib/server/house/energy.js";
import { presences } from "#lib/server/house/presence.js";

export const load = async ({ parent }) => {
	const { home } = await parent();
	const found = HomeDTO.find(home.id) ?? HomeDTO.first();
	return {
		devices: DeviceDTO.inHome(home.id).map((device) => device.toJSON()),
		energySummaries: energy.summaries(found.id, automations.timeZoneOf(found)),
		presence: presences.everyone(),
	};
};
