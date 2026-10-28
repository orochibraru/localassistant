import { fail } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { RoomDTO } from "#lib/dto/room.js";
import { access } from "#lib/server/auth/access.js";
import { homes } from "#lib/server/house/homes.js";
import {
	editFloorSchema,
	editRoomSchema,
	floorSchema,
	roomSettingsSchema,
} from "#lib/server/validation/device.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";

function placeRefusal(
	homeId: string,
	floorId: string | null,
	outdoor: boolean,
) {
	if (floorId !== null && !FloorDTO.find(floorId, homeId)) {
		return fail(400, { errors: { place: ["That floor is gone."] } });
	}
	if (floorId === null && !outdoor && FloorDTO.nearestGround(homeId)) {
		return fail(400, { errors: { place: ["Pick the room's floor."] } });
	}
	return undefined;
}

export const load = async ({ parent }) => {
	const { home } = await parent();
	const counts = new Map<string, number>();
	for (const device of DeviceDTO.inHome(home.id)) {
		const roomId = device.toJSON().roomId;
		if (roomId) {
			counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
		}
	}
	return { deviceCounts: Object.fromEntries(counts) };
};

export const actions = {
	addRoom: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(roomSettingsSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (RoomDTO.nameTaken(parsed.data.name, home.id, parsed.data)) {
			return fail(400, {
				errors: { name: ["There's already a room with that name there."] },
			});
		}
		const refusal = placeRefusal(
			home.id,
			parsed.data.floorId,
			parsed.data.outdoor,
		);
		if (refusal) {
			return refusal;
		}
		return { room: RoomDTO.create(home.id, parsed.data).toJSON() };
	},
	editRoom: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(editRoomSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { id, ...settings } = parsed.data;
		const room = RoomDTO.find(id, home.id);
		if (!room) {
			return fail(404, { error: "That room is gone." });
		}
		if (RoomDTO.nameTaken(settings.name, home.id, settings, id)) {
			return fail(400, {
				errors: { name: ["There's already a room with that name there."] },
			});
		}
		const refusal = placeRefusal(home.id, settings.floorId, settings.outdoor);
		if (refusal) {
			return refusal;
		}
		room.update(settings);
		return { saved: true };
	},
	removeRoom: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(idSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a room." });
		}
		RoomDTO.find(parsed.data.id, home.id)?.delete();
		return { removed: true };
	},
	addFloor: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(floorSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (FloorDTO.nameTaken(parsed.data.name, home.id)) {
			return fail(400, {
				errors: { name: ["A floor already has that name."] },
			});
		}
		return {
			floor: FloorDTO.create(
				home.id,
				parsed.data.name,
				parsed.data.level,
			).toJSON(),
		};
	},
	editFloor: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(editFloorSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const floor = FloorDTO.find(parsed.data.id, home.id);
		if (!floor) {
			return fail(404, { error: "That floor is gone." });
		}
		if (FloorDTO.nameTaken(parsed.data.name, home.id, parsed.data.id)) {
			return fail(400, {
				errors: { name: ["A floor already has that name."] },
			});
		}
		floor.update(parsed.data.name, parsed.data.level);
		return { saved: true };
	},
	removeFloor: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(idSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a floor." });
		}
		FloorDTO.find(parsed.data.id, home.id)?.delete();
		return { removed: true };
	},
};
