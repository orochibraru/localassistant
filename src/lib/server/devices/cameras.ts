import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { CameraState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { configuration } from "#lib/server/core/config.js";
import { Logger } from "#lib/server/core/logger.js";
import { secrets } from "#lib/server/core/secrets.js";

const logger = new Logger("Cameras");

const recordingPattern = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.mp4$/;
const livePattern = /^(index\.m3u8|segment-\d+\.ts)$/;
const segmentSeconds = 300;
const longestBackoffMs = 60_000;

interface Watch {
	key: string;
	process: ReturnType<typeof Bun.spawn> | null;
	failures: number;
	retryAt: number;
}

export interface Recording {
	file: string;
	startedAt: string;
	bytes: number;
}

/**
 * Cameras with local RTSP: the worker runs one ffmpeg per camera, writing a short HLS stream for the live view and, when
 * recording is on, five-minute MP4 files kept for the camera's retention days. Nothing is re-encoded but the audio.
 */
class Cameras {
	#watches = new Map<string, Watch>();

	/** Where a camera's files live, under the database's folder. */
	folder(deviceId: string, part: "live" | "recordings"): string {
		return join(
			dirname(configuration.get().databasePath),
			"cameras",
			deviceId,
			part,
		);
	}

	/** The path of a live or recorded file, or `null` for a name that isn't one LocalAssistant writes. */
	file(
		deviceId: string,
		part: "live" | "recordings",
		name: string,
	): string | null {
		const pattern = part === "live" ? livePattern : recordingPattern;
		return /^[\w-]+$/.test(deviceId) && pattern.test(name)
			? join(this.folder(deviceId, part), name)
			: null;
	}

	/** A camera's recordings, newest first. */
	async recordings(deviceId: string): Promise<Recording[]> {
		const folder = this.folder(deviceId, "recordings");
		const names = await readdir(folder).catch(() => [] as string[]);
		const found = await Promise.all(
			names
				.filter((name) => recordingPattern.test(name))
				.map(async (name) => ({
					file: name,
					startedAt: this.#startOf(name).toISOString(),
					bytes: (await stat(join(folder, name)).catch(() => null))?.size ?? 0,
				})),
		);
		return found.toSorted((first, second) =>
			second.file.localeCompare(first.file),
		);
	}

	/**
	 * Starts, restarts or stops ffmpeg so every camera runs with its current settings, deletes recordings past their
	 * retention and records each camera's state; never throws.
	 */
	async sync(now = new Date()): Promise<void> {
		const cameras = DeviceDTO.all().filter(
			(device) => device.kind === "camera",
		);
		const wanted = new Set(cameras.map((camera) => camera.id));
		for (const [deviceId, watch] of this.#watches) {
			if (!wanted.has(deviceId)) {
				watch.process?.kill();
				this.#watches.delete(deviceId);
			}
		}
		for (const camera of cameras) {
			try {
				await this.#keepRunning(camera, now);
				await this.#prune(camera, now);
				camera.saveState(await this.#state(camera));
			} catch (error) {
				logger.warn("Camera sync failed", { camera: camera.id }, error);
				camera.saveError(
					error instanceof Error ? error.message : "ffmpeg failed.",
				);
			}
		}
	}

	/** Stops every ffmpeg, for the worker's shutdown. */
	stopAll(): void {
		for (const watch of this.#watches.values()) {
			watch.process?.kill();
		}
		this.#watches.clear();
	}

	/** The ffmpeg arguments for a camera: HLS for the live view, and five-minute MP4 files when it records. */
	arguments(url: string, deviceId: string, record: boolean): string[] {
		const live = this.folder(deviceId, "live");
		const recordings = this.folder(deviceId, "recordings");
		const streams = [
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			"-c:v",
			"copy",
			"-c:a",
			"aac",
			"-b:a",
			"64k",
		];
		return [
			"-hide_banner",
			"-loglevel",
			"error",
			"-rtsp_transport",
			"tcp",
			"-i",
			url,
			...streams,
			"-f",
			"hls",
			"-hls_time",
			"2",
			"-hls_list_size",
			"6",
			"-hls_flags",
			"delete_segments+independent_segments+omit_endlist",
			"-hls_segment_filename",
			join(live, "segment-%d.ts"),
			join(live, "index.m3u8"),
			...(record
				? [
						...streams,
						"-f",
						"segment",
						"-segment_time",
						String(segmentSeconds),
						"-segment_format",
						"mp4",
						"-segment_format_options",
						"movflags=+frag_keyframe+empty_moov+default_base_moof",
						"-reset_timestamps",
						"1",
						"-strftime",
						"1",
						join(recordings, "%Y-%m-%d_%H-%M-%S.mp4"),
					]
				: []),
		];
	}

	async #keepRunning(camera: DeviceDTO, now: Date): Promise<void> {
		const encrypted = camera.encryptedLocalKey();
		if (!encrypted) {
			throw new Error("This camera has no RTSP address.");
		}
		const url = secrets.decrypt(encrypted);
		const record = camera.options.record ?? false;
		const key = `${url}|${record}`;
		const watch = this.#watches.get(camera.id);
		if (
			watch?.key === key &&
			watch.process &&
			watch.process.exitCode === null
		) {
			watch.failures = 0;
			return;
		}
		if (watch && watch.key === key && now.getTime() < watch.retryAt) {
			return;
		}
		watch?.process?.kill();
		await mkdir(this.folder(camera.id, "live"), { recursive: true });
		await mkdir(this.folder(camera.id, "recordings"), { recursive: true });
		const failures = watch?.key === key ? watch.failures + 1 : 0;
		const ffmpeg = Bun.which("ffmpeg");
		if (!ffmpeg) {
			throw new Error("ffmpeg isn't installed on the server.");
		}
		const process = Bun.spawn(
			[ffmpeg, ...this.arguments(url, camera.id, record)],
			{
				env: { TZ: "UTC" },
				stdout: "ignore",
				stderr: "ignore",
			},
		);
		this.#watches.set(camera.id, {
			key,
			process,
			failures,
			retryAt: now.getTime() + Math.min(longestBackoffMs, 5000 * 2 ** failures),
		});
		logger.info("Camera stream started", { camera: camera.id, record });
	}

	async #prune(camera: DeviceDTO, now: Date): Promise<void> {
		const keepDays = camera.options.retentionDays ?? 7;
		const before = now.getTime() - keepDays * 24 * 60 * 60_000;
		for (const recording of await this.recordings(camera.id)) {
			if (Date.parse(recording.startedAt) < before) {
				await rm(join(this.folder(camera.id, "recordings"), recording.file), {
					force: true,
				});
			}
		}
	}

	async #state(camera: DeviceDTO): Promise<CameraState> {
		const index = Bun.file(join(this.folder(camera.id, "live"), "index.m3u8"));
		const fresh =
			(await index.exists()) && Date.now() - index.lastModified < 30_000;
		const latest = (await this.recordings(camera.id))[0];
		return {
			type: "camera",
			streaming: fresh,
			recording: (camera.options.record ?? false) && fresh,
			lastRecordingAt: latest?.startedAt ?? null,
		};
	}

	#startOf(name: string): Date {
		const [date = "", time = ""] = name.replace(".mp4", "").split("_");
		return new Date(`${date}T${time.replaceAll("-", ":")}Z`);
	}
}

export const cameras = new Cameras();
