import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import { automations } from "#lib/server/automations/automations.js";
import { energy } from "#lib/server/house/energy.js";
import { wholeHouse } from "#lib/server/validation/device.js";

export const load = async ({ params, parent }) => {
	const { home } = await parent();
	const found = HomeDTO.find(home.id) ?? HomeDTO.first();
	const energySummaries = energy.summaries(
		found.id,
		automations.timeZoneOf(found),
	);
	if (params.roomId === wholeHouse) {
		return {
			room: { id: wholeHouse, name: "Whole house" },
			energySummaries,
			devices: DeviceDTO.inRoom(home.id, null).map((device) => device.toJSON()),
		};
	}
	const room = RoomDTO.find(params.roomId, home.id);
	if (!room) {
		error(404, "That room doesn't exist.");
	}
	return {
		room: room.toJSON(),
		energySummaries,
		devices: DeviceDTO.inRoom(home.id, params.roomId).map((device) =>
			device.toJSON(),
		),
	};
};
