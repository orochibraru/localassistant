import type { Handle } from "@sveltejs/kit/hooks";

const always = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "same-origin",
	"Permissions-Policy":
		"camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
	"Cross-Origin-Opener-Policy": "same-origin",
};

function apply(headers: Headers, https: boolean): void {
	for (const [name, value] of Object.entries(always)) {
		if (!headers.has(name)) {
			headers.set(name, value);
		}
	}
	if (https) {
		headers.set(
			"Strict-Transport-Security",
			"max-age=31536000; includeSubDomains",
		);
	}
}

/** Adds the response headers every page and endpoint gets, HSTS included when the request came over HTTPS. */
export const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const https = event.url.protocol === "https:";
	try {
		apply(response.headers, https);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		apply(copy.headers, https);
		return copy;
	}
};
