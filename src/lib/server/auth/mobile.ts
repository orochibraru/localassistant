import { createHash } from "node:crypto";

import { error } from "@sveltejs/kit";
import type { z } from "zod";

import { MobileCodeDTO } from "#lib/dto/mobile-code.js";
import { authService } from "#lib/server/auth/auth.js";
import { RateLimiter } from "#lib/server/auth/rate-limit.js";
import {
	type mobileAuthorizeSchema,
	mobileRedirectUri,
} from "#lib/server/validation/mobile.js";

const signInLifetimeMs = 60_000;
const pairLifetimeMs = 2 * 60_000;
const refused =
	"That code expired or was already used. Sign in again from the app.";

type MobileAuthorizeRequest = z.output<typeof mobileAuthorizeSchema>;

interface PendingSignIn {
	userId: string;
	challenge: string;
	device: string;
}

/**
 * Signs the mobile app in: an authorization code grant with PKCE from a browser sheet, or a code a signed-in browser
 * shows as a QR code. Either ends in an ordinary session, listed and revocable with the browser ones.
 */
class MobileSignIn {
	readonly #attempts = new RateLimiter(10, 15 * 60_000);

	/** The app link that hands `userId`'s approval back to the app: a one-minute code bound to its PKCE challenge. */
	approve(userId: string, request: MobileAuthorizeRequest): string {
		const pending: PendingSignIn = {
			userId,
			challenge: request.code_challenge,
			device: request.device || "phone",
		};
		const code = MobileCodeDTO.issue(
			"sign-in",
			JSON.stringify(pending),
			signInLifetimeMs,
		);
		const target = new URL(mobileRedirectUri);
		target.searchParams.set("code", code);
		target.searchParams.set("state", request.state);
		return target.toString();
	}

	/** A pairing link for `userId` that a phone scanning it within two minutes signs in with, and when it expires. */
	pair(userId: string, origin: string): { url: string; expiresAt: Date } {
		const code = MobileCodeDTO.issue("pair", userId, pairLifetimeMs);
		const url = new URL("localassistant://pair");
		url.searchParams.set("server", origin);
		url.searchParams.set("code", code);
		return {
			url: url.toString(),
			expiresAt: new Date(Date.now() + pairLifetimeMs),
		};
	}

	/**
	 * The account and device name a code signs in: with a verifier, a code from the browser sheet that must match its
	 * challenge; without, a pairing code. `null` when it's unknown, expired, used, or the verifier is wrong.
	 */
	redeem(
		code: string,
		verifier: string | undefined,
		device: string,
	): { userId: string; device: string } | null {
		if (verifier === undefined) {
			const userId = MobileCodeDTO.redeem("pair", code);
			return userId ? { userId, device } : null;
		}
		const value = MobileCodeDTO.redeem("sign-in", code);
		if (!value) {
			return null;
		}
		const pending = JSON.parse(value) as PendingSignIn;
		return this.verifierMatches(verifier, pending.challenge)
			? { userId: pending.userId, device: pending.device }
			: null;
	}

	/** Whether `verifier` is the one `challenge` was made from: RFC 7636 S256. */
	verifierMatches(verifier: string, challenge: string): boolean {
		return (
			createHash("sha256").update(verifier).digest("base64url") === challenge
		);
	}

	/**
	 * Trades a sign-in or pairing `code` from `address` for a session; see `redeem` and `createSession`.
	 *
	 * @throws A 429 error after ten wrong codes in fifteen minutes, a 400 one for a code that doesn't sign anyone in.
	 */
	async exchange(
		code: string,
		verifier: string | undefined,
		device: string,
		address: string,
	): Promise<{ token: string; expiresAt: Date }> {
		if (this.#attempts.blocked(address)) {
			error(429, "Too many tries. Wait a few minutes, then sign in again.");
		}
		const redeemed = this.redeem(code, verifier, device || "phone");
		if (!redeemed) {
			this.#attempts.hit(address);
			error(400, refused);
		}
		return await this.createSession(redeemed.userId, redeemed.device);
	}

	/** Ends the app's session behind `token`, as signing out of it. */
	async signOut(token: string): Promise<void> {
		const context = await authService.get().$context;
		await context.internalAdapter.deleteSession(token);
	}

	/** Opens a session for `userId`, named after the phone, and returns the bearer token the app keeps. */
	async createSession(
		userId: string,
		device: string,
	): Promise<{ token: string; expiresAt: Date }> {
		const context = await authService.get().$context;
		const created = await context.internalAdapter.createSession(userId, false, {
			userAgent: `LocalAssistant app · ${device}`.slice(0, 200),
		});
		return { token: created.token, expiresAt: created.expiresAt };
	}
}

export const mobileSignIn = new MobileSignIn();
