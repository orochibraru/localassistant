import { fail } from "@sveltejs/kit";
import { renderSVG } from "uqr";

import { authService } from "#lib/server/auth/auth.js";
import { mobileSignIn } from "#lib/server/auth/mobile.js";
import { securityPolicy } from "#lib/server/auth/security-policy.js";

export const actions = {
	pair: ({ locals, url }) => {
		if (!locals.user || !locals.session) {
			return fail(401, { error: "Sign in again to continue." });
		}
		if (!securityPolicy.signedInRecently(locals.session)) {
			return fail(403, { error: securityPolicy.recentSignInMessage });
		}
		const pairing = mobileSignIn.pair(
			locals.user.id,
			authService.publicOrigin() ?? url.origin,
		);
		return {
			pairing: {
				qrCode: renderSVG(pairing.url, { border: 1 }),
				url: pairing.url,
				expiresAt: pairing.expiresAt.toISOString(),
			},
		};
	},
};
