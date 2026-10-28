import type { Cookies } from "@sveltejs/kit";

import { secrets } from "#lib/server/core/secrets.js";

const setupCookie = "localassistant_setup_ticket";
const ticketTtlMs = 30 * 60 * 1000;

/** The signed cookie that carries a visitor through the setup flow. */
class SignUpCookies {
	/** Remembers that this browser entered the setup code. */
	grantSetupTicket(cookies: Cookies, url: URL): void {
		cookies.set(
			setupCookie,
			secrets.sign({}, "setup-ticket", ticketTtlMs),
			this.#options(url, ticketTtlMs),
		);
	}

	/** Whether this browser entered the setup code recently. */
	hasSetupTicket(cookies: Cookies): boolean {
		return (
			secrets.verify(cookies.get(setupCookie), "setup-ticket") !== undefined
		);
	}

	/** Forgets the setup step. */
	clearSetupTicket(cookies: Cookies): void {
		cookies.delete(setupCookie, { path: "/auth" });
	}

	/** The options the setup cookie is set with, scoped to `/auth` and living `ttlMs`. */
	#options(url: URL, ttlMs: number) {
		return {
			path: "/auth",
			httpOnly: true,
			sameSite: "lax" as const,
			secure: url.protocol === "https:",
			maxAge: ttlMs / 1000,
		};
	}
}

export const signUpCookies = new SignUpCookies();
