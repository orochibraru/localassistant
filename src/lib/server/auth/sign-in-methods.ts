import { hasLinkedProvider } from "#lib/dto/account.js";
import { PasskeyDTO } from "#lib/dto/passkey.js";
import { allSettings, getSetting, type SsoProvider } from "#lib/dto/setting.js";
import {
	configuration,
	type SignInMethodName,
} from "#lib/server/core/config.js";
import { mailer } from "#lib/server/notifications/mailer.js";

export type SignInMethodSetting =
	"passwordSignIn" | "passkeySignIn" | "magicLinkSignIn" | "emailCodeSignIn";

const environmentNames: Record<SignInMethodSetting, SignInMethodName> = {
	passwordSignIn: "password",
	passkeySignIn: "passkey",
	magicLinkSignIn: "magic-link",
	emailCodeSignIn: "email-code",
};

export interface SignInMethods {
	password: boolean;
	passkey: boolean;
	magicLink: boolean;
	emailCode: boolean;
	sso: Pick<SsoProvider, "id" | "name">[];
}

/** Which sign-in methods an admin left on, and which of them a given account can use. */
class SignInMethodPolicy {
	/**
	 * The sign-in methods an admin left on, with only the enabled single sign-on providers. Email links and codes count
	 * only while email delivery works.
	 */
	enabled(): SignInMethods {
		const settings = allSettings();
		const email = mailer.isConfigured();
		return {
			password: this.isOn("passwordSignIn"),
			passkey: this.isOn("passkeySignIn"),
			magicLink: this.isOn("magicLinkSignIn") && email,
			emailCode: this.isOn("emailCodeSignIn") && email,
			sso: settings.ssoProviders
				.filter((provider) => provider.enabled)
				.map(({ id, name }) => ({ id, name })),
		};
	}

	/** Whether `method` is allowed: as `SIGN_IN_METHODS` says when the server sets it, else as an admin left it. */
	isOn(method: SignInMethodSetting): boolean {
		const pinned = configuration.get().signInMethods;
		return pinned
			? pinned.includes(environmentNames[method])
			: getSetting(method);
	}

	/** Whether `SIGN_IN_METHODS` pins the methods, so the admin settings don't apply. */
	pinned(): boolean {
		return configuration.get().signInMethods !== undefined;
	}

	/** Which of the enabled methods `userId` could sign in with right now. */
	usable(userId: string, methods: SignInMethods): string[] {
		const usable: string[] = [];
		if (methods.password) {
			usable.push("password");
		}
		if (methods.passkey && PasskeyDTO.forUser(userId).length > 0) {
			usable.push("passkey");
		}
		if (
			hasLinkedProvider(
				userId,
				methods.sso.map((provider) => provider.id),
			)
		) {
			usable.push("sso");
		}
		if (methods.magicLink || methods.emailCode) {
			usable.push("email");
		}
		return usable;
	}

	/** A URL-safe id for a provider name, used in its callback URL. */
	providerSlug(name: string): string {
		return (
			name
				.toLowerCase()
				.normalize("NFKD")
				.replaceAll(/\p{Diacritic}/gu, "")
				.replaceAll(/[^a-z0-9]+/g, "-")
				.replaceAll(/^-|-$/g, "")
				.slice(0, 40) || "sso"
		);
	}
}

export const signInMethods = new SignInMethodPolicy();
