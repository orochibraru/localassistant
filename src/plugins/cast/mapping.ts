import type { MediaChange, MediaPlayback, MediaState } from "#lib/devices.js";
import type { FoundDevice } from "#lib/plugin-sdk.js";

import { castNamespaces, type CastPayload } from "./connection.js";

export const castKind = "cast";
export const castPort = 8009;
export const serviceName = "_googlecast._tcp.local";

export interface CastRecord {
	type: string;
	name: string;
	data: unknown;
}

export interface CastApplication {
	appId: string;
	displayName: string | null;
	sessionId: string;
	transportId: string;
	media: boolean;
}

export interface CastRequest {
	target: "receiver" | "media";
	payload: CastPayload;
}

const defaultMediaReceiver = "CC1AD845";
const queueNext = 64;
const queuePrevious = 128;

const playbacks: Record<string, MediaPlayback> = {
	PLAYING: "playing",
	BUFFERING: "playing",
	PAUSED: "paused",
	IDLE: "idle",
};

const mediaTypes = {
	play: "PLAY",
	pause: "PAUSE",
	stop: "STOP",
} as const;

/** Turns what Cast devices announce and report into devices and media states, and media changes into Cast requests. */
class CastMapping {
	/** The Cast devices in a set of mDNS records: a PTR per device, its TXT (`id`, `fn`, `md`), SRV and address. */
	found(records: CastRecord[]): FoundDevice[] {
		const instances = new Set(
			records
				.filter(
					(record) => record.type === "PTR" && record.name === serviceName,
				)
				.map((record) => String(record.data)),
		);
		const devices = new Map<string, FoundDevice>();
		for (const instance of instances) {
			const text = this.#txt(records, instance);
			const service = this.#service(records, instance);
			const address = records.find(
				(record) => record.type === "A" && record.name === service?.target,
			);
			const id = text.get("id");
			if (!id || typeof address?.data !== "string") {
				continue;
			}
			devices.set(id, {
				kind: castKind,
				externalId: id,
				name: text.get("fn") ?? text.get("md") ?? "Cast device",
				host: address.data,
				fields: {
					model: text.get("md") ?? "",
					port: service?.port ?? castPort,
				},
			});
		}
		return [...devices.values()];
	}

	/** The app the receiver runs, leaving out its idle screen, or null when there's none. */
	application(receiver: CastPayload): CastApplication | null {
		const status = this.#object(receiver.status);
		const applications = Array.isArray(status.applications)
			? status.applications.map((entry) => this.#object(entry))
			: [];
		const running = applications.find(
			(entry) => entry.isIdleScreen !== true && typeof entry.appId === "string",
		);
		if (!running) {
			return null;
		}
		const namespaces = Array.isArray(running.namespaces)
			? running.namespaces.map((entry) => this.#object(entry).name)
			: [];
		return {
			appId: String(running.appId),
			displayName: this.#string(running.displayName),
			sessionId: String(running.sessionId ?? ""),
			transportId: String(running.transportId ?? ""),
			media: namespaces.includes(castNamespaces.media),
		};
	}

	/** The media session in a media status, or an empty object when nothing is loaded. */
	session(media: CastPayload | null): Record<string, unknown> {
		const sessions = Array.isArray(media?.status) ? media.status : [];
		return this.#object(sessions[0]);
	}

	/** The state the media card shows from the receiver's status and, when its app plays media, the media status. */
	state(receiver: CastPayload, media: CastPayload | null): MediaState {
		const status = this.#object(receiver.status);
		const volume = this.#object(status.volume);
		const fixed = volume.controlType === "fixed";
		const level = typeof volume.level === "number" ? volume.level : null;
		const application = this.application(receiver);
		const session = this.session(media);
		const metadata = this.#object(this.#object(session.media).metadata);
		return {
			type: "media",
			power: status.isStandBy !== true && application !== null,
			playback: application
				? (playbacks[String(session.playerState)] ?? "idle")
				: null,
			title: this.#string(metadata.title),
			artist:
				this.#string(metadata.artist) ??
				this.#string(metadata.albumArtist) ??
				this.#string(metadata.subtitle) ??
				this.#string(metadata.seriesTitle),
			volume: fixed || level === null ? null : Math.round(level * 100),
			muted: fixed || typeof volume.muted !== "boolean" ? null : volume.muted,
			source: application?.displayName ?? null,
			sources: [],
		};
	}

	/**
	 * The requests that carry out `change`, given the receiver's and the media's current status.
	 *
	 * @throws When the device or the app on it can't do what the change asks.
	 */
	requests(
		change: MediaChange,
		receiver: CastPayload,
		media: CastPayload | null,
	): CastRequest[] {
		const application = this.application(receiver);
		const requests: CastRequest[] = [];
		if (change.power === false && application) {
			requests.push({
				target: "receiver",
				payload: { type: "STOP", sessionId: application.sessionId },
			});
		}
		if (change.power === true && !application) {
			requests.push({
				target: "receiver",
				payload: { type: "LAUNCH", appId: defaultMediaReceiver },
			});
		}
		if (change.volume !== undefined) {
			requests.push({
				target: "receiver",
				payload: {
					type: "SET_VOLUME",
					volume: { level: Math.min(Math.max(change.volume, 0), 100) / 100 },
				},
			});
		}
		if (change.muted !== undefined) {
			requests.push({
				target: "receiver",
				payload: { type: "SET_VOLUME", volume: { muted: change.muted } },
			});
		}
		if (change.source !== undefined) {
			throw new Error("A Cast device can't switch apps from here.");
		}
		if (change.action) {
			requests.push(this.#action(change.action, media));
		}
		return requests;
	}

	#action(
		action: NonNullable<MediaChange["action"]>,
		media: CastPayload | null,
	): CastRequest {
		const session = this.session(media);
		const mediaSessionId = session.mediaSessionId;
		if (typeof mediaSessionId !== "number") {
			throw new Error("Nothing is playing on it that it can control.");
		}
		const supported =
			typeof session.supportedMediaCommands === "number"
				? session.supportedMediaCommands
				: 0;
		if (action === "next" || action === "previous") {
			const flag = action === "next" ? queueNext : queuePrevious;
			if (Math.floor(supported / flag) % 2 === 0) {
				throw new Error(
					`The app playing can't skip to the ${action === "next" ? "next" : "previous"} track.`,
				);
			}
			return {
				target: "media",
				payload: {
					type: "QUEUE_UPDATE",
					mediaSessionId,
					jump: action === "next" ? 1 : -1,
				},
			};
		}
		return {
			target: "media",
			payload: { type: mediaTypes[action], mediaSessionId },
		};
	}

	#string(value: unknown): string | null {
		return typeof value === "string" && value.trim() ? value.trim() : null;
	}

	#txt(records: CastRecord[], instance: string): Map<string, string> {
		const entries = new Map<string, string>();
		const record = records.find(
			(candidate) => candidate.type === "TXT" && candidate.name === instance,
		);
		const strings = Array.isArray(record?.data) ? record.data : [record?.data];
		for (const entry of strings) {
			const line = Buffer.isBuffer(entry)
				? entry.toString("utf8")
				: String(entry ?? "");
			const separator = line.indexOf("=");
			if (separator > 0) {
				entries.set(line.slice(0, separator), line.slice(separator + 1));
			}
		}
		return entries;
	}

	#service(
		records: CastRecord[],
		instance: string,
	): { target: string; port: number } | null {
		const data = this.#object(
			records.find(
				(record) => record.type === "SRV" && record.name === instance,
			)?.data,
		);
		return typeof data.target === "string" && typeof data.port === "number"
			? { target: data.target, port: data.port }
			: null;
	}

	#object(value: unknown): Record<string, unknown> {
		return typeof value === "object" && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	}
}

export const castMapping = new CastMapping();
