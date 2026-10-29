import { error } from "@sveltejs/kit";

import { DashboardDTO } from "#lib/dto/dashboard.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { presences } from "#lib/server/house/presence.js";

export const load = async ({ params, parent }) => {
	const { home, user } = await parent();
	const dashboard = DashboardDTO.find(params.dashboardId, user.id);
	if (!dashboard) {
		error(404, "That dashboard is gone.");
	}
	return {
		dashboard: dashboard.toJSON(),
		devices: DeviceDTO.inHome(home.id).map((device) => device.toJSON()),
		scenes: SceneDTO.inHome(home.id).map((scene) => ({
			id: scene.id,
			name: scene.name,
		})),
		presence: presences.everyone(),
	};
};
