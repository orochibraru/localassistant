import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { RoomDTO } from "#lib/dto/room.js";
import { access } from "#lib/server/auth/access.js";
import { homes } from "#lib/server/house/homes.js";
import { planChangesSchema } from "#lib/server/validation/device.js";

export const savePlan = command(
	planChangesSchema,
	({ rooms, moves, pins, baseFloorId }) => {
		const user = access.requireUser();
		if (!access.isAdmin(user)) {
			error(403, "Only admins can do that.");
		}
		const home = homes.current(getRequestEvent().cookies);
		const shapes = rooms.map(({ roomId, plan }) => ({
			room: RoomDTO.find(roomId, home.id),
			plan,
		}));
		const moved = moves.map(({ deviceId, roomId }) => ({
			device: DeviceDTO.find(deviceId),
			roomId,
		}));
		if (shapes.some(({ room }) => !room)) {
			error(404, "A room on the plan is gone.");
		}
		if (
			moved.some(
				({ device, roomId }) =>
					device?.toJSON().homeId !== home.id ||
					(roomId !== null && !RoomDTO.find(roomId, home.id)),
			)
		) {
			error(404, "A device or the room it moves to is gone.");
		}
		const pinned = pins.map(({ deviceId, pin }) => ({
			device: DeviceDTO.find(deviceId),
			pin,
		}));
		if (pinned.some(({ device }) => device?.toJSON().homeId !== home.id)) {
			error(404, "A device pinned on the plan is gone.");
		}
		if (baseFloorId && !FloorDTO.find(baseFloorId, home.id)) {
			error(404, "That floor is gone.");
		}
		for (const { room, plan } of shapes) {
			room?.place(plan);
		}
		for (const { device, roomId } of moved) {
			device?.rename(device.toJSON().name, roomId);
		}
		for (const { device, pin } of pinned) {
			if (device) {
				const { pin: _old, ...options } = device.options;
				device.setOptions(pin ? { ...options, pin } : options);
			}
		}
		if (baseFloorId !== undefined) {
			home.setPlanBase(baseFloorId);
		}
	},
);
