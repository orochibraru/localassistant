import { PasskeyDTO } from "#lib/dto/passkey.js";
import { getSetting } from "#lib/dto/setting.js";
import type { Session } from "#lib/server/auth/auth.js";
import { signInMethods } from "#lib/server/auth/sign-in-methods.js";

export type SecurityFactor = "two-factor" | "passkey";

export interface SessionGate {
	reason: "factors";
	missing: SecurityFactor[];
}

const recentSignInMs = 15 * 60_000;

const securityRouteId = "/(protected)/account/security";

/** What a signed-in session still needs before it reaches the app, and how fresh it must be to change security settings. */
class SecurityPolicy {
	readonly recentSignInMessage =
		"For your safety, sign out and back in, then do this within 15 minutes.";

	/**
	 * The factors `user` must still set up: what an admin requires, plus a passkey when password sign-in is off and
	 * they'd otherwise have no way back in.
	 */
	missingFactors(user: {
		id: string;
		twoFactorEnabled?: boolean | null;
	}): SecurityFactor[] {
		const missing: SecurityFactor[] = [];
		if (getSetting("requireTwoFactor") && !user.twoFactorEnabled) {
			missing.push("two-factor");
		}
		const hasPasskey = PasskeyDTO.forUser(user.id).length > 0;
		const methods = signInMethods.enabled();
		const lockedOut =
			!methods.password && signInMethods.usable(user.id, methods).length === 0;
		if ((getSetting("requirePasskey") || lockedOut) && !hasPasskey) {
			missing.push("passkey");
		}
		return missing;
	}

	/** Whether `session` signed in recently enough to change security settings without proving who it is again. */
	signedInRecently(session: { createdAt: Date }, now = Date.now()): boolean {
		return now - session.createdAt.getTime() < recentSignInMs;
	}

	/**
	 * What keeps a signed-in session from the app on this request: factors an admin requires and it
	 * lacks (everywhere but the security page, where it sets them up). `undefined` when nothing does.
	 */
	sessionGate(
		current: Session,
		routeId: string | null,
	): SessionGate | undefined {
		const missing = this.missingFactors(current.user);
		if (missing.length > 0 && routeId !== securityRouteId) {
			return { reason: "factors", missing };
		}
		return undefined;
	}
}

export const securityPolicy = new SecurityPolicy();
