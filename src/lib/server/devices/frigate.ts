import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { JobDTO } from "#lib/dto/job.js";
import { type FrigateServer, getSetting } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";

const requestTimeoutMs = 15_000;
const alertGapMs = 5 * 60_000;

export interface FrigateEvent {
	id: string;
	label: string;
	score: number | null;
	startedAt: string;
	endedAt: string | null;
	hasClip: boolean;
	hasSnapshot: boolean;
}

interface RawEvent {
	id: string;
	label: string;
	camera?: string;
	top_score?: number | null;
	start_time: number;
	end_time: number | null;
	has_clip: boolean;
	has_snapshot: boolean;
}

/**
 * Frigate NVR over its HTTP API and MQTT events: its cameras come in as devices, their snapshots, live MJPEG, events
 * and clips are proxied to signed-in people, and a new detection of a chosen kind pushes a notification.
 */
class Frigate {
	#alerted = new Map<string, number>();

	/**
	 * The camera names Frigate is set up with.
	 *
	 * @throws When Frigate can't be reached at `server.url`.
	 */
	async cameraNames(server: Pick<FrigateServer, "url">): Promise<string[]> {
		const response = await this.#get(server.url, "/api/config");
		const config = (await response.json()) as {
			cameras?: Record<string, unknown>;
		};
		return Object.keys(config.cameras ?? {});
	}

	/**
	 * Adds a device for every Frigate camera not already one; returns how many it found.
	 *
	 * @throws When no Frigate is set up or it can't be reached.
	 */
	async import(): Promise<number> {
		const server = this.#server();
		const names = await this.cameraNames(server);
		const homeId = (HomeDTO.find(server.homeId) ?? HomeDTO.first()).id;
		const known = new Set(
			DeviceDTO.all()
				.filter((device) => device.kind === "frigate-camera")
				.map((device) => device.externalId),
		);
		for (const name of names.filter((entry) => !known.has(entry))) {
			DeviceDTO.upsert({
				kind: "frigate-camera",
				homeId,
				name: name
					.replaceAll("_", " ")
					.replace(/^\w/, (first) => first.toUpperCase()),
				externalId: name,
			});
		}
		return names.length;
	}

	/**
	 * The latest events of `camera`, newest first.
	 *
	 * @throws When no Frigate is set up or it can't be reached.
	 */
	async events(camera: string, limit = 24): Promise<FrigateEvent[]> {
		const query = new URLSearchParams({
			cameras: camera,
			limit: String(limit),
		});
		const response = await this.#get(
			this.#server().url,
			`/api/events?${query}`,
		);
		return ((await response.json()) as RawEvent[]).map((event) => ({
			id: event.id,
			label: event.label,
			score: event.top_score ?? null,
			startedAt: new Date(event.start_time * 1000).toISOString(),
			endedAt: event.end_time
				? new Date(event.end_time * 1000).toISOString()
				: null,
			hasClip: event.has_clip,
			hasSnapshot: event.has_snapshot,
		}));
	}

	/**
	 * Fetches `path` from Frigate for a signed-in person, passing a video player's `Range` through and streaming the body.
	 *
	 * @throws When no Frigate is set up or it can't be reached.
	 */
	async proxy(path: string, request: Request): Promise<Response> {
		const range = request.headers.get("range");
		const response = await this.#get(
			this.#server().url,
			path,
			range ? { Range: range } : {},
			null,
		);
		const headers = new Headers({ "Cache-Control": "no-store" });
		for (const name of [
			"content-type",
			"content-length",
			"content-range",
			"accept-ranges",
		]) {
			const value = response.headers.get(name);
			if (value) {
				headers.set(name, value);
			}
		}
		return new Response(response.body, { status: response.status, headers });
	}

	/** Reacts to a `frigate/events` message: a new detection of a chosen label pushes everyone, once every five minutes per camera and label. */
	alert(payload: unknown, now = Date.now()): void {
		const server = getSetting("frigate");
		const message = payload as { type?: string; after?: RawEvent } | null;
		const event = message?.after;
		if (
			!server ||
			message?.type !== "new" ||
			!event?.camera ||
			!server.notifyLabels.includes(event.label)
		) {
			return;
		}
		const device = DeviceDTO.all().find(
			(entry) =>
				entry.kind === "frigate-camera" && entry.externalId === event.camera,
		);
		if (!device) {
			return;
		}
		const key = `${device.id}:${event.label}`;
		if (now - (this.#alerted.get(key) ?? 0) < alertGapMs) {
			return;
		}
		this.#alerted.set(key, now);
		JobDTO.enqueue("push.send", {
			userIds: UserDTO.people().map((person) => person.id),
			title: `${event.label.replace(/^\w/, (first) => first.toUpperCase())} seen`,
			body: `${device.toJSON().name}, just now.`,
			url: `/cameras/${device.id}`,
		});
	}

	#server(): FrigateServer {
		const server = getSetting("frigate");
		if (!server) {
			throw new Error("Connect Frigate first.");
		}
		return server;
	}

	async #get(
		base: string,
		path: string,
		headers: Record<string, string> = {},
		timeoutMs: number | null = requestTimeoutMs,
	): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
				headers,
				...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
			});
		} catch (error) {
			throw new Error("Frigate can't be reached. Check its address.", {
				cause: error,
			});
		}
		if (!response.ok && response.status !== 206) {
			throw new Error(`Frigate answered ${response.status}.`);
		}
		return response;
	}
}

export const frigate = new Frigate();
