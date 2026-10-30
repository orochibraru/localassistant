import { version } from "$app/env";
import { assets, immutable, prerendered } from "$app/manifest";
import { self as worker } from "$app/service-worker";

const cacheName = `localassistant-${version}`;
const pagesCacheName = `localassistant-pages-${version}`;
const offlinePage = "/offline.html";
const neverCached = ["/api/", "/auth/", "/downloads/"];
const precached = new Set(
	[...immutable, ...assets, ...prerendered]
		.map((entry) => `/${entry.path}`.replace(/^\/+/, "/"))
		.filter(
			(path) => !path.split("/").some((segment) => segment.startsWith(".")),
		),
);

worker.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(cacheName)
			.then((cache) => cache.addAll([...precached]))
			.then(() => worker.skipWaiting()),
	);
});

worker.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== cacheName && key !== pagesCacheName)
						.map((key) => caches.delete(key)),
				),
			)
			.then(() => worker.clients.claim()),
	);
});

async function sentToSignIn(response: Response, url: URL): Promise<boolean> {
	if (
		response.redirected &&
		new URL(response.url).pathname.startsWith("/auth/")
	) {
		return true;
	}
	if (!url.pathname.endsWith("/__data.json")) {
		return false;
	}
	const body = await response.clone().text();
	return /"type":"redirect","location":"\/auth\//.test(body);
}

async function networkFirst(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(pagesCacheName);
	try {
		const response = await fetch(request);
		if (await sentToSignIn(response, url)) {
			await caches.delete(pagesCacheName);
			return response;
		}
		if (response.ok && response.type === "basic") {
			await cache.put(request, response.clone());
		}
		return response;
	} catch (error) {
		const cached = await cache.match(request, {
			ignoreSearch: url.pathname.endsWith("/__data.json"),
		});
		if (cached) {
			return cached;
		}
		if (request.mode === "navigate") {
			return (
				(await caches.match(offlinePage)) ??
				new Response("You're offline.", { status: 503 })
			);
		}
		throw error;
	}
}

worker.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (event.request.method !== "GET" || url.origin !== worker.location.origin) {
		return;
	}
	if (precached.has(url.pathname)) {
		event.respondWith(
			caches
				.open(cacheName)
				.then(
					async (cache) =>
						(await cache.match(url.pathname)) ?? fetch(event.request),
				),
		);
		return;
	}
	if (event.request.mode === "navigate" && url.pathname.startsWith("/auth/")) {
		event.waitUntil(caches.delete(pagesCacheName));
		return;
	}
	if (!neverCached.some((prefix) => url.pathname.startsWith(prefix))) {
		event.respondWith(networkFirst(event.request, url));
	}
});

worker.addEventListener("push", (event) => {
	const payload = (event.data?.json() ?? {}) as {
		title?: string;
		body?: string;
		url?: string;
		actions?: { action: string; title: string }[];
	};
	event.waitUntil(
		worker.registration.showNotification(payload.title ?? "LocalAssistant", {
			body: payload.body,
			icon: "/pwa-192x192.png",
			badge: "/pwa-64x64.png",
			data: { url: payload.url ?? "/" },
			...(payload.actions ? { actions: payload.actions } : {}),
		} as NotificationOptions),
	);
});

async function runAction(action: string, title: string): Promise<void> {
	const response = await fetch("/api/notification-action", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ action }),
		credentials: "same-origin",
	}).catch(() => null);
	const answer = response
		? ((await response.json().catch(() => ({}))) as { message?: string })
		: { message: "The server can't be reached." };
	await worker.registration.showNotification(title, {
		body: response?.ok ? "Done." : (answer.message ?? "That didn't work."),
		icon: "/pwa-192x192.png",
		badge: "/pwa-64x64.png",
		data: { url: "/" },
	});
}

worker.addEventListener("notificationclick", (event) => {
	event.notification.close();
	if (event.action) {
		event.waitUntil(runAction(event.action, event.notification.title));
		return;
	}
	const target = new URL(
		String((event.notification.data as { url?: string } | null)?.url ?? "/"),
		worker.location.origin,
	);
	event.waitUntil(
		worker.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then(async (windows) => {
				const open = windows.find(
					(client) => new URL(client.url).origin === target.origin,
				);
				if (open) {
					await open.focus();
					await open.navigate(target.href);
					return;
				}
				await worker.clients.openWindow(target.href);
			}),
	);
});
