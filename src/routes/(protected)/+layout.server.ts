import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import { getSetting } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { homes } from "#lib/server/house/homes.js";

export const load = ({ cookies, locals, url }) => {
	if (!locals.user) {
		access.redirectToSignIn(url);
	}
	return {
		user: {
			id: locals.user.id,
			name: locals.user.name,
			email: locals.user.email,
		},
		isAdmin: access.isAdmin(locals.user),
		...houseOf(homes.current(cookies)),
		melCloudEmail: access.isAdmin(locals.user)
			? (getSetting("melcloud")?.email ?? null)
			: null,
	};
};

function houseOf(home: HomeDTO) {
	const multipleHomes = getSetting("multipleHomes");
	return {
		home: home.toJSON(),
		homes: multipleHomes ? HomeDTO.all().map((entry) => entry.toJSON()) : [],
		multipleHomes,
		rooms: RoomDTO.inHome(home.id).map((room) => room.toJSON()),
		floors: FloorDTO.inHome(home.id).map((floor) => floor.toJSON()),
		setup: DeviceDTO.inHome(home.id).map((device) => {
			const { state: _state, ...row } = device.toJSON();
			return row;
		}),
	};
}
