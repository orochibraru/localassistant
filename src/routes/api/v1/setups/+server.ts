import { json } from "@sveltejs/kit";

import { UserDTO } from "#lib/dto/user.js";
import { access } from "#lib/server/auth/access.js";
import { broker } from "#lib/server/devices/broker.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";

export const GET = () => {
	access.requireAdmin();
	return json({
		setups: pluginSetup.setups(),
		broker: broker.configured(),
		people: UserDTO.people(),
	});
};
