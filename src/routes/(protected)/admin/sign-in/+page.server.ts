import { fail } from "@sveltejs/kit";
import { z } from "zod";

import { getSetting, setSetting, type SsoProvider } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { authService } from "#lib/server/auth/auth.js";
import { signInMethods } from "#lib/server/auth/sign-in-methods.js";
import { secrets } from "#lib/server/core/secrets.js";
import { mailer } from "#lib/server/notifications/mailer.js";
import { parseForm } from "#lib/server/validation/form.js";

const methodsSchema = z.object({
	passwordSignIn: z.stringbool().default(false),
	passkeySignIn: z.stringbool().default(false),
	magicLinkSignIn: z.stringbool().default(false),
	emailCodeSignIn: z.stringbool().default(false),
});

const providerSchema = z.object({
	id: z.string().optional(),
	name: z
		.string()
		.trim()
		.min(1, "Name the provider, like Authentik or Google.")
		.max(40),
	discoveryUrl: z.url({
		protocol: /^https?$/,
		error: "Enter the provider's discovery URL.",
	}),
	clientId: z.string().trim().min(1, "Enter the client ID.").max(300),
	clientSecret: z.string().max(500),
	enabled: z.stringbool().default(false),
});

const providerIdSchema = z.object({ id: z.string().min(1) });

/** Fetches an OpenID discovery document, checking it's one. */
async function checkDiscovery(url: string): Promise<string | undefined> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
		const document = (await response.json()) as {
			authorization_endpoint?: unknown;
		};
		return typeof document.authorization_endpoint === "string"
			? undefined
			: "That URL isn't an OpenID discovery document.";
	} catch {
		return "The discovery URL didn't answer. It usually ends in /.well-known/openid-configuration.";
	}
}

export const load = async ({ parent, url }) => {
	await parent();
	return {
		passwordSignIn: signInMethods.isOn("passwordSignIn"),
		passkeySignIn: signInMethods.isOn("passkeySignIn"),
		magicLinkSignIn: signInMethods.isOn("magicLinkSignIn"),
		emailCodeSignIn: signInMethods.isOn("emailCodeSignIn"),
		methodsPinned: signInMethods.pinned(),
		emailConfigured: mailer.isConfigured(),
		providers: getSetting("ssoProviders").map(
			({ encryptedClientSecret: _secret, ...provider }) => provider,
		),
		callbackBase: `${authService.publicOrigin() ?? url.origin}/api/auth/callback/`,
	};
};

export const actions = {
	methods: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		if (signInMethods.pinned()) {
			return fail(400, {
				error:
					"SIGN_IN_METHODS sets the methods on this server: remove it to choose them here.",
			});
		}
		const parsed = parseForm(methodsSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const sso = getSetting("ssoProviders")
			.filter((provider) => provider.enabled)
			.map(({ id, name }) => ({ id, name }));
		const email = mailer.isConfigured();
		if (
			(parsed.data.magicLinkSignIn || parsed.data.emailCodeSignIn) &&
			!email
		) {
			return fail(400, {
				error: "Email links and codes need email delivery: set up SMTP first.",
			});
		}
		const next = {
			password: parsed.data.passwordSignIn,
			passkey: parsed.data.passkeySignIn,
			magicLink: parsed.data.magicLinkSignIn,
			emailCode: parsed.data.emailCodeSignIn,
			sso,
		};
		if (
			!next.password &&
			!next.passkey &&
			!next.magicLink &&
			!next.emailCode &&
			sso.length === 0
		) {
			return fail(400, { error: "Keep at least one way to sign in." });
		}
		if (signInMethods.usable(admin.id, next).length === 0) {
			return fail(400, {
				error:
					"You'd lock yourself out: add a passkey or sign in once with SSO before turning that off.",
			});
		}
		setSetting("passwordSignIn", next.password);
		setSetting("passkeySignIn", next.passkey);
		setSetting("magicLinkSignIn", next.magicLink);
		setSetting("emailCodeSignIn", next.emailCode);
		return { saved: true };
	},
	saveProvider: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(providerSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const providers = getSetting("ssoProviders");
		const existing = providers.find(
			(provider) => provider.id === parsed.data.id,
		);
		if (!existing && !parsed.data.clientSecret) {
			return fail(400, {
				errors: { clientSecret: ["Enter the client secret."] },
			});
		}
		const discoveryProblem = await checkDiscovery(parsed.data.discoveryUrl);
		if (discoveryProblem) {
			return fail(400, { errors: { discoveryUrl: [discoveryProblem] } });
		}
		let id = existing?.id ?? signInMethods.providerSlug(parsed.data.name);
		while (!existing && providers.some((provider) => provider.id === id)) {
			id = `${id}-2`;
		}
		const saved: SsoProvider = {
			id,
			name: parsed.data.name,
			discoveryUrl: parsed.data.discoveryUrl,
			clientId: parsed.data.clientId,
			encryptedClientSecret: parsed.data.clientSecret
				? secrets.encrypt(parsed.data.clientSecret)
				: (existing?.encryptedClientSecret ?? ""),
			enabled: parsed.data.enabled,
		};
		setSetting(
			"ssoProviders",
			existing
				? providers.map((provider) => (provider.id === id ? saved : provider))
				: [...providers, saved],
		);
		return { saved: true };
	},
	toggleProvider: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(providerIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a provider." });
		}
		setSetting(
			"ssoProviders",
			getSetting("ssoProviders").map((provider) =>
				provider.id === parsed.data.id
					? { ...provider, enabled: !provider.enabled }
					: provider,
			),
		);
		return { toggled: true };
	},
	deleteProvider: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(providerIdSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a provider." });
		}
		const remaining = getSetting("ssoProviders").filter(
			(provider) => provider.id !== parsed.data.id,
		);
		if (
			!signInMethods.isOn("passwordSignIn") &&
			!signInMethods.isOn("passkeySignIn") &&
			!remaining.some((provider) => provider.enabled)
		) {
			return fail(400, {
				error:
					"It's the last way to sign in. Turn passwords or passkeys back on first.",
			});
		}
		setSetting("ssoProviders", remaining);
		return { deleted: true };
	},
};
