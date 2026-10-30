import { error } from "@sveltejs/kit";
import type { z } from "zod";

import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { getSetting } from "#lib/dto/setting.js";
import { kindInfo } from "#lib/plugins.js";
import { assistant } from "#lib/server/assistant/assistant.js";
import { access } from "#lib/server/auth/access.js";
import type { Session } from "#lib/server/auth/auth.js";
import { homes } from "#lib/server/house/homes.js";
import { presences } from "#lib/server/house/presence.js";
import { plugins } from "#lib/server/plugins/registry.js";

/** What the native app reads and sends over `/api/v1`, on top of the services the pages use. */
class MobileApi {
	/** The home the app asks for with `?home=`, or the first one. */
	home(url: URL): HomeDTO {
		return homes.pick(url.searchParams.get("home"));
	}

	/**
	 * The JSON body of `request` checked against `schema`.
	 *
	 * @throws A 400 error with the first problem when it isn't JSON or doesn't fit.
	 */
	async body<Schema extends z.ZodType>(
		request: Request,
		schema: Schema,
	): Promise<z.output<Schema>> {
		const parsed = schema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			error(
				400,
				parsed.error.issues[0]?.message ?? "That request is malformed.",
			);
		}
		return parsed.data;
	}

	/** Everything the app draws for `user` in `home`: the account, floors, rooms, devices with their state, scenes and people. */
	house(user: Session["user"], home: HomeDTO) {
		const catalog = plugins.catalog();
		return {
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				isAdmin: access.isAdmin(user),
			},
			home: home.toJSON(),
			homes: getSetting("multipleHomes")
				? HomeDTO.all().map((entry) => entry.toJSON())
				: [],
			floors: FloorDTO.inHome(home.id).map((floor) => floor.toJSON()),
			rooms: RoomDTO.inHome(home.id).map((room) => room.toJSON()),
			devices: DeviceDTO.inHome(home.id).map((device) => {
				const info = kindInfo(catalog, device.kind);
				return { ...device.toJSON(), card: info.card, icon: info.icon };
			}),
			scenes: SceneDTO.inHome(home.id).map((scene) => ({
				id: scene.id,
				name: scene.name,
			})),
			people: presences.everyone(),
			assistant: assistant.configured(),
		};
	}

	/** The routines of `home`, by name, with whether each is on. */
	routines(home: HomeDTO): { id: string; name: string; enabled: boolean }[] {
		return AutomationDTO.inHome(home.id).map((automation) => ({
			id: automation.id,
			name: automation.name,
			enabled: automation.enabled,
		}));
	}
}

export const mobileApi = new MobileApi();
