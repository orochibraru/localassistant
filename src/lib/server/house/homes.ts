import type { Cookies } from "@sveltejs/kit";

import { HomeDTO } from "#lib/dto/home.js";
import { getSetting } from "#lib/dto/setting.js";

const cookieName = "localassistant_home";
const yearSeconds = 365 * 24 * 60 * 60;

/** Which home a browser is looking at: the first one, or the one it picked once an admin turned on several homes. */
class Homes {
	/** The home this browser looks at. */
	current(cookies: Cookies): HomeDTO {
		if (getSetting("multipleHomes")) {
			const picked = cookies.get(cookieName);
			const home = picked ? HomeDTO.find(picked) : undefined;
			if (home) {
				return home;
			}
		}
		return HomeDTO.first();
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
