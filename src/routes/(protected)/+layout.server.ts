import { CardLayoutDTO } from "#lib/dto/card-layout.js";
import { CardSizeDTO } from "#lib/dto/card-size.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import { getSetting } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import { type KindCatalog, kindInfo } from "#lib/plugins.js";
import { access } from "#lib/server/auth/access.js";
import { broker } from "#lib/server/devices/broker.js";
import { homes } from "#lib/server/house/homes.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";

export const load = ({ cookies, locals, url }) => {
	if (!locals.user) {
		access.redirectToSignIn(url);
	}
	const admin = access.isAdmin(locals.user);
	const kinds = plugins.catalog();
	return {
		user: {
			id: locals.user.id,
			name: locals.user.name,
			email: locals.user.email,
		},
		isAdmin: admin,
		cardSizes: CardSizeDTO.forUser(locals.user.id),
		cardLayout: CardLayoutDTO.forUser(locals.user.id),
		people: UserDTO.people(),
		kinds,
		...houseOf(homes.current(cookies), kinds),
		pluginSetups: admin ? pluginSetup.setups() : [],
		brokerUrl:
			admin && broker.configured() ? (getSetting("mqtt")?.url ?? null) : null,
	};
};

function houseOf(home: HomeDTO, kinds: KindCatalog) {
	const multipleHomes = getSetting("multipleHomes");
	return {
		home: home.toJSON(),
		homes: multipleHomes ? HomeDTO.all().map((entry) => entry.toJSON()) : [],
		multipleHomes,
		rooms: RoomDTO.inHome(home.id).map((room) => room.toJSON()),
		floors: FloorDTO.inHome(home.id).map((floor) => floor.toJSON()),
		setup: DeviceDTO.inHome(home.id).map((device) => {
			const { state: _state, ...row } = device.toJSON();
			return { ...row, card: kindInfo(kinds, row.kind).card };
		}),
	};
}
