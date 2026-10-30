import type { Cookies } from "@sveltejs/kit";

import { HomeDTO } from "#lib/dto/home.js";
import { getSetting } from "#lib/dto/setting.js";

const cookieName = "localassistant_home";
const yearSeconds = 365 * 24 * 60 * 60;

/** Which home a browser is looking at: the first one, or the one it picked once an admin turned on several homes. */
class Homes {
	/** The home this browser looks at. */
	current(cookies: Cookies): HomeDTO {
		return this.pick(cookies.get(cookieName));
	}

	/** The home with `homeId` while several homes are on and it exists, the first one otherwise. */
	pick(homeId: string | null | undefined): HomeDTO {
		const home =
			homeId && getSetting("multipleHomes") ? HomeDTO.find(homeId) : undefined;
		return home ?? HomeDTO.first();
	}

	/** Makes `homeId` the home this browser looks at; `false` when no home has that id. */
	choose(cookies: Cookies, url: URL, homeId: string): boolean {
		if (!HomeDTO.find(homeId)) {
			return false;
		}
		cookies.set(cookieName, homeId, {
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			secure: url.protocol === "https:",
			maxAge: yearSeconds,
		});
		return true;
	}
}

export const homes = new Homes();
