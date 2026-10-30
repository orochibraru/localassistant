import { fail } from "@sveltejs/kit";
import { renderSVG } from "uqr";

import { DeviceDTO } from "#lib/dto/device.js";
import { access } from "#lib/server/auth/access.js";
import { authService } from "#lib/server/auth/auth.js";
import { mobileSignIn } from "#lib/server/auth/mobile.js";
import { securityPolicy } from "#lib/server/auth/security-policy.js";
import { homes } from "#lib/server/house/homes.js";
import { appDeviceSchema } from "#lib/server/validation/device.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";

export const actions = {
	register: async ({ cookies, locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(appDeviceSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const device = DeviceDTO.upsert({
			kind: "app",
			homeId: homes.current(cookies).id,
			ownerId: locals.user.id,
			name: parsed.data.name,
			externalId: crypto.randomUUID(),
		});
		return { deviceId: device.id };
	},
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
	forget: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(idSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a device." });
		}
		const device = DeviceDTO.find(parsed.data.id);
		if (
			device?.kind === "app" &&
			(device.ownerId === locals.user.id || access.isAdmin(locals.user))
		) {
			device.delete();
		}
		return { forgotten: true };
	},
};
