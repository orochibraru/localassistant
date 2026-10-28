import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { hasLinkedProvider } from "#lib/dto/account.js";
import { setSetting } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import { authService } from "#lib/server/auth/auth.js";
import { signInMethods } from "#lib/server/auth/sign-in-methods.js";
import { configuration } from "#lib/server/core/config.js";
import { secrets } from "#lib/server/core/secrets.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { account, job, session, user } from "#lib/server/db/schema.js";

import { createUser, resetDatabase } from "../../database.js";

function provider(id: string, enabled: boolean) {
	return {
		id,
		name: id,
		discoveryUrl: `https://${id}.example.com/.well-known/openid-configuration`,
		clientId: "localassistant",
		encryptedClientSecret: secrets.encrypt("secret"),
		enabled,
	};
}

async function answered(call: Promise<Response>): Promise<Response> {
	try {
		return await call;
	} catch (error) {
		if (error instanceof APIError) {
			return Response.json(error.body, { status: error.statusCode });
		}
		throw error;
	}
}

function linkAccount(userId: string, providerId: string): void {
	databaseConnection
		.get()
		.insert(account)
		.values({
			id: `${userId}-${providerId}`,
			accountId: userId,
			providerId,
			userId,
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.run();
}

describe("sign-in methods", () => {
	beforeEach(() => {
		resetDatabase();
		databaseConnection.get().delete(account).run();
	});

	test("only enabled providers are offered", () => {
		setSetting("ssoProviders", [
			provider("authentik", true),
			provider("old", false),
		]);
		expect(signInMethods.enabled()).toEqual({
			password: true,
			passkey: true,
			magicLink: false,
			emailCode: false,
			sso: [{ id: "authentik", name: "authentik" }],
		});
	});

	test("a user can use password, and SSO once they linked it", () => {
		const ada = createUser("ada");
		const methods = {
			password: false,
			passkey: true,
			magicLink: false,
			emailCode: false,
			sso: [{ id: "authentik", name: "Authentik" }],
		};
		expect(signInMethods.usable(ada.id, methods)).toEqual([]);
		linkAccount(ada.id, "authentik");
		expect(hasLinkedProvider(ada.id, [])).toBe(false);
		expect(
			signInMethods.usable(ada.id, { ...methods, password: true }),
		).toEqual(["password", "sso"]);
	});

	test("provider slugs are URL-safe", () => {
		expect(signInMethods.providerSlug("Keycloak (Prod)!")).toBe(
			"keycloak-prod",
		);
		expect(signInMethods.providerSlug("Éclair")).toBe("eclair");
		expect(signInMethods.providerSlug("***")).toBe("sso");
	});
});

describe("getAuth", () => {
	beforeEach(resetDatabase);

	test("rebuilds only when providers or sign-ups change", () => {
		const first = authService.get();
		expect(authService.get()).toBe(first);
		setSetting("ssoProviders", [provider("authentik", true)]);
		const withProvider = authService.get();
		expect(withProvider).not.toBe(first);
		setSetting("signUpsEnabled", true);
		expect(authService.get()).not.toBe(withProvider);
	});

	test("refuses sign-in methods an admin turned off", async () => {
		setSetting("passwordSignIn", false);
		setSetting("passkeySignIn", false);
		setSetting("ssoProviders", [provider("off", false), provider("on", true)]);
		const auth = authService.get();
		const headers = new Headers({
			host: "localhost",
			origin: "http://localhost",
		});
		const call = (path: string, body?: unknown, accept = "application/json") =>
			auth.handler(
				new Request(`http://localhost/api/auth${path}`, {
					method: body === undefined ? "GET" : "POST",
					headers: {
						"content-type": "application/json",
						origin: "http://localhost",
						accept,
					},
					body: body === undefined ? undefined : JSON.stringify(body),
				}),
			);
		const password = await answered(
			auth.api.signInEmail({
				body: { email: "ada@example.com", password: "whatever-it-is" },
				headers,
				asResponse: true,
			}),
		);
		expect(password.status).toBe(403);
		expect(await password.text()).toContain("Password sign-in is turned off");
		const passkey = await call("/passkey/generate-authenticate-options");
		expect(passkey.status).toBe(403);
		const sso = await answered(
			auth.api.signInSocial({
				body: { provider: "off" },
				headers,
				asResponse: true,
			}),
		);
		expect(sso.status).toBe(403);
		const callback = await call(
			"/callback/off?code=x&state=y",
			undefined,
			"text/html",
		);
		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe(
			"/auth/sign-in?error=method_off",
		);
		const enabled = await call(
			"/callback/on?code=x&state=y",
			undefined,
			"text/html",
		);
		expect(enabled.headers.get("location") ?? "").not.toContain("method_off");
	});

	test("answers only the endpoints a browser needs, leaving the rest to form actions", async () => {
		const auth = authService.get();
		for (const path of [
			"/sign-in/email",
			"/two-factor/verify-totp",
			"/change-email",
			"/update-user",
		]) {
			const response = await auth.handler(
				new Request(`http://localhost/api/auth${path}`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: "http://localhost",
					},
					body: "{}",
				}),
			);
			expect(response.status).toBe(404);
		}
	});
});

describe("signing in by email", () => {
	beforeEach(() => {
		resetDatabase();
		databaseConnection.get().delete(account).run();
	});

	function enableEmail() {
		setSetting("smtp", {
			host: "smtp.example.com",
			port: 587,
			security: "starttls",
			username: "",
			encryptedPassword: secrets.encrypt(""),
			fromAddress: "localassistant@example.com",
			fromName: "LocalAssistant",
		});
		setSetting("magicLinkSignIn", true);
		setSetting("emailCodeSignIn", true);
		setSetting("publicOrigin", "http://localhost");
	}

	const headers = new Headers({
		host: "localhost",
		origin: "http://localhost",
	});

	function sendLink(body: { email: string; callbackURL?: string }) {
		return answered(
			authService
				.get()
				.api.signInMagicLink({ body, headers, asResponse: true }),
		);
	}

	function sendCode(body: {
		email: string;
		type: "sign-in" | "forget-password";
	}) {
		return answered(
			authService
				.get()
				.api.sendVerificationOTP({ body, headers, asResponse: true }),
		);
	}

	function signInWithCode(body: { email: string; otp: string }) {
		return answered(
			authService.get().api.signInEmailOTP({ body, headers, asResponse: true }),
		);
	}

	function lastEmail(): { subject: string; text: string } | undefined {
		return databaseConnection
			.get()
			.select({ payload: job.payload })
			.from(job)
			.all()
			.map((row) => row.payload as { subject: string; text: string })
			.at(-1);
	}

	test("both methods stay off without SMTP or the admin's say-so", async () => {
		setSetting("magicLinkSignIn", true);
		expect(signInMethods.enabled()).toMatchObject({
			magicLink: false,
			emailCode: false,
		});
		const link = await sendLink({
			email: "ada@example.com",
		});
		expect(link.status).toBe(403);
		const code = await sendCode({
			email: "ada@example.com",
			type: "sign-in",
		});
		expect(code.status).toBe(403);
	});

	test("a code by email signs an existing account in", async () => {
		enableEmail();
		createUser("ada");
		expect(signInMethods.enabled()).toMatchObject({
			magicLink: true,
			emailCode: true,
		});
		expect(signInMethods.usable("ada", signInMethods.enabled())).toContain(
			"email",
		);
		const sent = await sendCode({
			email: "ada@example.com",
			type: "sign-in",
		});
		expect(sent.status).toBe(200);
		const code = /(\d{3}) (\d{3})/.exec(lastEmail()?.text ?? "");
		expect(code).not.toBeNull();
		const wrong = await signInWithCode({
			email: "ada@example.com",
			otp: "000000",
		});
		expect(wrong.status).toBe(400);
		const signedIn = await signInWithCode({
			email: "ada@example.com",
			otp: `${code?.[1]}${code?.[2]}`,
		});
		expect(signedIn.status).toBe(200);
		expect(signedIn.headers.getSetCookie().join(";")).toContain(
			"session_token",
		);
	});

	test("a link by email signs an existing account in", async () => {
		enableEmail();
		createUser("ada");
		const sent = await sendLink({
			email: "ada@example.com",
			callbackURL: "/",
		});
		expect(sent.status).toBe(200);
		const link = /http\S+magic-link\/verify\S+/.exec(lastEmail()?.text ?? "");
		expect(link).not.toBeNull();
		const verified = await authService
			.get()
			.handler(new Request(link?.[0] ?? "", { redirect: "manual" }));
		expect(verified.status).toBeGreaterThanOrEqual(300);
		expect(verified.headers.getSetCookie().join(";")).toContain(
			"session_token",
		);
	});

	test("no account is created and two-factor accounts get the code step after a link or a code", async () => {
		enableEmail();
		const ghost = await signInWithCode({
			email: "ghost@example.com",
			otp: "123456",
		});
		expect(ghost.status).not.toBe(200);
		expect(UserDTO.idForEmail("ghost@example.com")).toBeUndefined();

		createUser("grace", "Grace");
		databaseConnection
			.get()
			.update(user)
			.set({ twoFactorEnabled: true })
			.where(eq(user.id, "grace"))
			.run();
		expect(signInMethods.usable("grace", signInMethods.enabled())).toContain(
			"email",
		);
		const sessions = () =>
			databaseConnection
				.get()
				.select()
				.from(session)
				.where(eq(session.userId, "grace"))
				.all().length;

		await sendLink({ email: "grace@example.com", callbackURL: "/" });
		const link = /http\S+magic-link\/verify\S+/.exec(lastEmail()?.text ?? "");
		const verified = await authService.get().handler(
			new Request(link?.[0] ?? "", {
				redirect: "manual",
				headers: {
					accept: "text/html",
					"x-forwarded-for": "10.9.0.1",
				},
			}),
		);
		expect(verified.status).toBe(302);
		expect(verified.headers.get("location")).toBe("/auth/two-factor");
		expect(verified.headers.getSetCookie().join(";")).toContain("two_factor");
		expect(sessions()).toBe(0);

		await sendCode({ email: "grace@example.com", type: "sign-in" });
		const code = /(\d{3}) (\d{3})/.exec(lastEmail()?.text ?? "");
		const signedIn = await signInWithCode({
			email: "grace@example.com",
			otp: `${code?.[1]}${code?.[2]}`,
		});
		expect(await signedIn.json()).toMatchObject({ twoFactorRedirect: true });
		expect(signedIn.headers.getSetCookie().join(";")).toContain("two_factor");
		expect(sessions()).toBe(0);
	});

	test("a trusted device skips the two-step check after a link", async () => {
		enableEmail();
		createUser("grace", "Grace");
		const pairs = (response: Response) =>
			response.headers
				.getSetCookie()
				.map((cookie) => cookie.split(";")[0])
				.join("; ");
		await sendCode({ email: "grace@example.com", type: "sign-in" });
		const code = /(\d{3}) (\d{3})/.exec(lastEmail()?.text ?? "");
		const signedIn = await signInWithCode({
			email: "grace@example.com",
			otp: `${code?.[1]}${code?.[2]}`,
		});
		const trusted = await answered(
			authService.get().api.trustDevice({
				headers: new Headers({ cookie: pairs(signedIn) }),
				asResponse: true,
			}),
		);
		expect(pairs(trusted)).toContain("trust_device");
		databaseConnection
			.get()
			.update(user)
			.set({ twoFactorEnabled: true })
			.where(eq(user.id, "grace"))
			.run();
		await sendLink({ email: "grace@example.com", callbackURL: "/" });
		const link = /http\S+magic-link\/verify\S+/.exec(lastEmail()?.text ?? "");
		const verified = await authService.get().handler(
			new Request(link?.[0] ?? "", {
				redirect: "manual",
				headers: {
					accept: "text/html",
					cookie: pairs(trusted),
					"x-forwarded-for": "10.9.0.2",
				},
			}),
		);
		expect(verified.headers.get("location")).not.toBe("/auth/two-factor");
		expect(pairs(verified)).not.toContain("two_factor");
		expect(
			databaseConnection
				.get()
				.select()
				.from(session)
				.where(eq(session.userId, "grace"))
				.all(),
		).toHaveLength(2);
	});

	test("emailed codes only ever sign in", async () => {
		enableEmail();
		createUser("ada");
		const reset = await sendCode({
			email: "ada@example.com",
			type: "forget-password",
		});
		expect(reset.status).toBe(403);
		const disabled = await authService.get().handler(
			new Request("http://localhost/api/auth/email-otp/reset-password", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost",
				},
				body: JSON.stringify({
					email: "ada@example.com",
					otp: "123456",
					password: "Another-Password-99",
				}),
			}),
		);
		expect(disabled.status).toBe(404);
	});
});

describe("SIGN_IN_METHODS", () => {
	beforeEach(resetDatabase);
	afterEach(() => {
		configuration.get().signInMethods = undefined;
	});

	test("lets the server's environment override the methods an admin chose", async () => {
		setSetting("passwordSignIn", false);
		setSetting("passkeySignIn", true);
		expect(signInMethods.pinned()).toBe(false);
		expect(signInMethods.isOn("passwordSignIn")).toBe(false);
		configuration.get().signInMethods = ["password"];
		expect(signInMethods.pinned()).toBe(true);
		expect(signInMethods.enabled()).toEqual(
			expect.objectContaining({ password: true, passkey: false }),
		);
		const response = await answered(
			authService.get().api.signInEmail({
				body: { email: "nobody@example.com", password: "whatever-it-is" },
				headers: new Headers({ host: "localhost", origin: "http://localhost" }),
				asResponse: true,
			}),
		);
		expect(await response.text()).not.toContain("turned off");
	});
});
