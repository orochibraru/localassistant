import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { error, fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

import { aiAppLifetimeMs } from "#lib/dto/ai-app.js";
import { authService } from "#lib/server/auth/auth.js";
import { parseForm } from "#lib/server/validation/form.js";

const expired = "This request expired. Start again from your AI app.";
const consentResultSchema = z.object({ url: z.string().min(1) });
const decisionSchema = z.object({
	query: z.string().min(1),
	accept: z.stringbool(),
});

export const load = async ({ parent, request, url }) => {
	await parent();
	const query = url.search.slice(1);
	const { secret } = await authService.get().$context;
	if (!(await verifyOAuthQueryParams(query, secret))) {
		error(400, expired);
	}
	const client = await authService
		.get()
		.api.getOAuthClientPublic({
			query: { client_id: url.searchParams.get("client_id") ?? "" },
			headers: request.headers,
		})
		.catch(() => undefined);
	if (!client) {
		error(404, "This AI app isn't known here anymore. Start again from it.");
	}
	return {
		query,
		app: {
			name: client.client_name ?? "An AI app",
			uri: client.client_uri ?? null,
		},
		days: aiAppLifetimeMs / 86_400_000,
	};
};

export const actions = {
	decide: async ({ locals, request, url }) => {
		if (!locals.user) {
			return fail(401, { error: "Sign in again to continue." });
		}
		const parsed = parseForm(decisionSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: expired });
		}
		const response = await authService.get().handler(
			new Request(new URL("/api/auth/oauth2/consent", url), {
				method: "POST",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
					cookie: request.headers.get("cookie") ?? "",
					origin: url.origin,
				},
				body: JSON.stringify({
					accept: parsed.data.accept,
					oauth_query: parsed.data.query,
				}),
			}),
		);
		const result = consentResultSchema.safeParse(
			await response.json().catch(() => undefined),
		);
		if (!response.ok || !result.success) {
			return fail(400, { error: expired });
		}
		redirect(303, result.data.url, { external: true });
	},
};
