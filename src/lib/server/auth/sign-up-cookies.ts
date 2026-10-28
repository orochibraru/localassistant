import type { Cookies } from "@sveltejs/kit";

import { secrets } from "#lib/server/core/secrets.js";

const pendingCookie = "localassistant_signup_pending";
const ticketCookie = "localassistant_signup_ticket";
const setupCookie = "localassistant_setup_ticket";
const pendingTtlMs = 15 * 60 * 1000;
const ticketTtlMs = 30 * 60 * 1000;

export type SignUpStep =
	| { step: "email" }
	| { step: "code"; email: string }
	| { step: "details"; email: string };

/** The signed cookies that carry a visitor through the sign-up stepper and the setup flow. */
class SignUpCookies {
	/** Where a visitor is in the sign-up stepper, from its signed cookies. */
	currentStep(cookies: Cookies): SignUpStep {
		const ticket = secrets.verify(cookies.get(ticketCookie), "signup-ticket");
		if (typeof ticket?.email === "string") {
			return { step: "details", email: ticket.email };
		}
		const pending = secrets.verify(
			cookies.get(pendingCookie),
			"signup-pending",
		);
		if (typeof pending?.email === "string") {
			return { step: "code", email: pending.email };
		}
		return { step: "email" };
	}

	/** Remembers that a code was sent to `email`. */
	rememberPending(cookies: Cookies, url: URL, email: string): void {
		cookies.set(
			pendingCookie,
			secrets.sign({ email }, "signup-pending", pendingTtlMs),
			this.#options(url, pendingTtlMs),
		);
	}

	/** Swaps the pending cookie for a ticket proving `email` was verified. */
	grantTicket(cookies: Cookies, url: URL, email: string): void {
		cookies.delete(pendingCookie, { path: "/auth" });
		cookies.set(
			ticketCookie,
			secrets.sign({ email }, "signup-ticket", ticketTtlMs),
			this.#options(url, ticketTtlMs),
		);
	}

	/** Forgets every sign-up step. */
	clear(cookies: Cookies): void {
		cookies.delete(pendingCookie, { path: "/auth" });
		cookies.delete(ticketCookie, { path: "/auth" });
	}

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

	/** The options every stepper cookie is set with, scoped to `/auth` and living `ttlMs`. */
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
