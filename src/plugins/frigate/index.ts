import type { CameraState } from "#lib/devices.js";
import {
	type CameraClips,
	definePlugin,
	type FoundDevice,
	type Plugin,
	type PluginContext,
	type PluginDevice,
	requestHeaders,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

const requestTimeoutMs = 15_000;
const alertGapMs = 5 * 60_000;

const cameraPaths: Record<string, (camera: string) => string> = {
	"latest.jpg": (camera) => `/api/${camera}/latest.jpg?h=480`,
	stream: (camera) => `/api/${camera}?fps=5&h=480`,
};
const eventResources = new Set(["snapshot.jpg", "clip.mp4", "thumbnail.jpg"]);

const state: CameraState = {
	type: "camera",
	streaming: true,
	recording: false,
	lastRecordingAt: null,
	source: "Frigate",
	live: { format: "image", path: "stream" },
	snapshot: "latest.jpg",
};

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

interface Target {
	url: string;
	headers: Record<string, string>;
}

/**
 * Frigate NVR over its HTTP API and MQTT events: its cameras come in as devices, their snapshots, live MJPEG, events
 * and clips are proxied to signed-in people, and a new detection of a chosen kind pushes a notification.
 */
class Frigate implements Plugin {
	#alerted = new Map<string, number>();

	/**
	 * Checks Frigate answers at the address.
	 *
	 * @throws When Frigate can't be reached there.
	 */
	async connect(values: PluginValues): Promise<void> {
		await this.cameraNames({
			url: String(values.url),
			headers: requestHeaders(values.headers),
		});
	}

	/**
	 * A device for every Frigate camera.
	 *
	 * @throws When Frigate isn't connected or can't be reached.
	 */
	async discover(context: PluginContext): Promise<FoundDevice[]> {
		const names = await this.cameraNames(this.#target(context));
		return names.map((name) => ({
			kind: "frigate-camera",
			externalId: name,
			name: name
				.replaceAll("_", " ")
				.replace(/^\w/, (first) => first.toUpperCase()),
			state,
		}));
	}

	/** Listens to Frigate's detections on the shared MQTT broker, which holds the subscription across reconnects. */
	start(context: PluginContext): void {
		if (context.settings()) {
			context.mqtt.subscribe("frigate/events", (_topic, payload) => {
				let parsed: unknown = null;
				try {
					parsed = JSON.parse(String(payload));
				} catch {
					return;
				}
				this.alert(context, parsed);
			});
		}
	}

	/**
	 * The camera names Frigate is set up with.
	 *
	 * @throws When Frigate can't be reached at `target`.
	 */
	async cameraNames(target: Target): Promise<string[]> {
		const response = await this.#get(target, "/api/config");
		const config = (await response.json()) as {
			cameras?: Record<string, unknown>;
		};
		return Object.keys(config.cameras ?? {});
	}

	/**
	 * The latest events of a camera, newest first, with their thumbnails and clips.
	 *
	 * @throws When Frigate isn't connected or can't be reached.
	 */
	async clips(
		device: PluginDevice,
		context: PluginContext,
	): Promise<CameraClips> {
		const query = new URLSearchParams({
			cameras: device.externalId,
			limit: "24",
		});
		const response = await this.#get(
			this.#target(context),
			`/api/events?${query}`,
		);
		return {
			title: "Events",
			empty: "No event yet.",
			clips: ((await response.json()) as RawEvent[]).map((event) => ({
				id: event.id,
				label: event.label,
				startedAt: new Date(event.start_time * 1000).toISOString(),
				video: event.has_clip ? `events/${event.id}/clip.mp4` : null,
				image: `events/${event.id}/thumbnail.jpg`,
				detail: null,
			})),
		};
	}

	/**
	 * Proxies a camera's `latest.jpg` or `stream`, or an event's `events/<id>/<snapshot.jpg|clip.mp4|thumbnail.jpg>`,
	 * passing a video player's `Range` through.
	 *
	 * @throws When Frigate isn't connected or can't be reached.
	 */
	async serve(
		device: PluginDevice,
		path: string,
		request: Request,
		context: PluginContext,
	): Promise<Response> {
		const [first = "", eventId = "", resource = ""] = path.split("/");
		const camera = cameraPaths[first];
		const upstream = camera
			? camera(encodeURIComponent(device.externalId))
			: first === "events" &&
				  /^[\w.-]+$/.test(eventId) &&
				  eventResources.has(resource)
				? `/api/events/${eventId}/${resource}`
				: null;
		if (!upstream) {
			return new Response("Not found", { status: 404 });
		}
		const range = request.headers.get("range");
		const response = await this.#get(
			this.#target(context),
			upstream,
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
	alert(context: PluginContext, payload: unknown, now = Date.now()): void {
		const labels = String(context.settings()?.notifyLabels ?? "")
			.split(",")
			.map((label) => label.trim().toLowerCase())
			.filter(Boolean);
		const message = payload as { type?: string; after?: RawEvent } | null;
		const event = message?.after;
		if (
			message?.type !== "new" ||
			!event?.camera ||
			!labels.includes(event.label)
		) {
			return;
		}
		const device = context
			.devices()
			.find((entry) => entry.externalId === event.camera);
		if (!device) {
			return;
		}
		const key = `${device.id}:${event.label}`;
		if (now - (this.#alerted.get(key) ?? 0) < alertGapMs) {
			return;
		}
		this.#alerted.set(key, now);
		context.notify({
			audience: "everyone",
			title: `${event.label.replace(/^\w/, (first) => first.toUpperCase())} seen`,
			body: `${device.name}, just now.`,
			url: `/cameras/${device.id}`,
		});
	}

	#target(context: PluginContext): Target {
		const settings = context.settings();
		if (typeof settings?.url !== "string") {
			throw new Error("Connect Frigate first.");
		}
		return { url: settings.url, headers: requestHeaders(settings.headers) };
	}

	async #get(
		target: Target,
		path: string,
		headers: Record<string, string> = {},
		timeoutMs: number | null = requestTimeoutMs,
	): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(`${target.url.replace(/\/$/, "")}${path}`, {
				headers: { ...target.headers, ...headers },
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

export default definePlugin(new Frigate());
