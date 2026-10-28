import { resolve } from "$app/paths";
import { getRequestEvent } from "$app/server";
import { error, fail, redirect, type RequestEvent } from "@sveltejs/kit";

import type { Session } from "#lib/server/auth/auth.js";
import { securityPolicy } from "#lib/server/auth/security-policy.js";
import { instanceSetup } from "#lib/server/auth/setup.js";

/** Who may reach a page, an action or a remote function, and where everyone else goes instead. */
class AccessGuard {
	/** Whether `user` holds the admin role. */
	isAdmin(user: { role?: string | null } | null | undefined): boolean {
		return user?.role === "admin";
	}

	/** The signed-in admin for a form action, or the failure to return when the caller isn't one. */
	adminFrom(
		locals: App.Locals,
	): Session["user"] | ReturnType<typeof fail<{ error: string }>> {
		if (!locals.user || !this.isAdmin(locals.user)) {
			return fail(403, { error: "Only admins can do that." });
		}
		return locals.user;
	}

	/** Like `adminFrom`, for an action that hands out access (a role, an email, a reset): it also needs a recent sign-in. */
	recentAdminFrom(
		locals: App.Locals,
	): Session["user"] | ReturnType<typeof fail<{ error: string }>> {
		const admin = this.adminFrom(locals);
		if (
			"id" in admin &&
			(!locals.session || !securityPolicy.signedInRecently(locals.session))
		) {
			return fail(403, { error: securityPolicy.recentSignInMessage });
		}
		return admin;
	}

	/**
	 * The signed-in user for the current remote function call; remote functions never run a layout's guard.
	 *
	 * @throws A 401 error when nobody is signed in.
	 */
	requireUser(): Session["user"] {
		const { locals } = getRequestEvent();
		if (!locals.user) {
			error(401, "Unauthorized");
		}
		return locals.user;
	}

	/**
	 * Sends a visitor with no usable session where they can get one, remembering where they were going: setup on a fresh
	 * instance, the security page for one missing a factor an admin requires,
	 * sign-in otherwise.
	 *
	 * @throws A 303 redirect.
	 */
	redirectToSignIn(url: URL): never {
		if (instanceSetup.needed()) {
			redirect(303, resolve("/auth/setup"));
		}
		const event: RequestEvent | undefined = getRequestEvent();
		const gate = event?.locals.gate;
		if (gate?.reason === "factors") {
			redirect(
				303,
				`${resolve("/(protected)/account/security")}?required=${gate.missing.join(",")}`,
			);
		}
		const target = encodeURIComponent(`${url.pathname}${url.search}`);
		redirect(303, `${resolve("/auth/sign-in")}?redirectTo=${target}`);
	}

	/** The in-app path to go to after signing in: `redirectTo` when it's a local path, home otherwise. */
	safeRedirectTarget(url: URL): string {
		const target = url.searchParams.get("redirectTo");
		const local = "http://local.invalid";
		const parsed = target?.startsWith("/") ? new URL(target, local) : undefined;
		return parsed?.origin === local
			? `${parsed.pathname}${parsed.search}${parsed.hash}`
			: resolve("/(protected)");
	}
}

export const access: AccessGuard = new AccessGuard();
