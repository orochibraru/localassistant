import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { RoomDTO } from "#lib/dto/room.js";
import { wholeHouse } from "#lib/server/validation/device.js";

export const load = async ({ params, parent }) => {
	const { home } = await parent();
	if (params.roomId === wholeHouse) {
		return {
			room: { id: wholeHouse, name: "Whole house" },
			devices: DeviceDTO.inRoom(home.id, null).map((device) => device.toJSON()),
		};
	}
	const room = RoomDTO.find(params.roomId, home.id);
	if (!room) {
		error(404, "That room doesn't exist.");
	}
	return {
		room: room.toJSON(),
		devices: DeviceDTO.inRoom(home.id, params.roomId).map((device) =>
			device.toJSON(),
		),
	};
};
