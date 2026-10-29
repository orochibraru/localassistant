import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { CameraState } from "#lib/devices.js";
import {
	type CameraClips,
	definePlugin,
	type FoundDevice,
	type Plugin,
	type PluginContext,
	type PluginDevice,
} from "#lib/plugin-sdk.js";
import type { PluginValues } from "#lib/plugins.js";

const recordingPattern = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.mp4$/;
const livePattern = /^(index\.m3u8|segment-\d+\.ts)$/;
const segmentSeconds = 300;
const longestBackoffMs = 60_000;
const syncEveryMs = 30_000;

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
class Cameras implements Plugin {
	#watches = new Map<string, Watch>();

	/** The camera the form describes, known by a digest of its address so a re-add finds it again. */
	add(values: PluginValues): FoundDevice {
		const url = String(values.url);
		return {
			kind: "camera",
			externalId: new Bun.CryptoHasher("sha256")
				.update(url)
				.digest("hex")
				.slice(0, 24),
			host: new URL(url.replace(/^rtsps?:/, "http:")).hostname,
		};
	}

	/** Keeps every camera's ffmpeg running, checking every thirty seconds. */
	async start(context: PluginContext): Promise<void> {
		context.every(syncEveryMs, () => this.sync(context));
		await this.sync(context);
	}

	/** Stops every ffmpeg, for the worker's shutdown or a restart. */
	stop(): void {
		for (const watch of this.#watches.values()) {
			watch.process?.kill();
		}
		this.#watches.clear();
	}

	/**
	 * Serves the live stream (`live/index.m3u8` and its segments) or a recording (`recordings/<file>`).
	 *
	 * @throws A 404 when the file isn't one LocalAssistant writes or is gone.
	 */
	serve(
		device: PluginDevice,
		path: string,
		request: Request,
		context: PluginContext,
	): Promise<Response> {
		const [part, name = ""] = path.split("/");
		const live = part === "live" && livePattern.test(name);
		const recorded = part === "recordings" && recordingPattern.test(name);
		if (!live && !recorded) {
			return Promise.resolve(new Response("Not found", { status: 404 }));
		}
		return context.sendFile(
			join(context.folder(device.id, part), name),
			request,
			live ? "no-store" : "private, max-age=3600",
		);
	}

	/** A camera's recordings, newest first, to play back. */
	async clips(
		device: PluginDevice,
		context: PluginContext,
	): Promise<CameraClips> {
		return {
			title: "Recordings",
			empty:
				"Nothing recorded yet. Turn recording on in the camera's settings.",
			clips: (
				await this.recordings(context.folder(device.id, "recordings"))
			).map((recording) => ({
				id: recording.file,
				label: "",
				startedAt: recording.startedAt,
				video: `recordings/${recording.file}`,
				image: null,
				detail: `${Math.round(recording.bytes / 1_000_000)} MB`,
			})),
		};
	}

	/** The recordings in `folder`, newest first. */
	async recordings(folder: string): Promise<Recording[]> {
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
	async sync(context: PluginContext, now = new Date()): Promise<void> {
		const cameras = context.devices();
		const wanted = new Set(cameras.map((camera) => camera.id));
		for (const [deviceId, watch] of this.#watches) {
			if (!wanted.has(deviceId)) {
				watch.process?.kill();
				this.#watches.delete(deviceId);
			}
		}
		for (const camera of cameras) {
			try {
				await this.#keepRunning(context, camera, now);
				await this.#prune(context, camera, now);
				context.saveState(camera, await this.#state(context, camera));
			} catch (error) {
				context.logger.warn("Camera sync failed", { camera: camera.id }, error);
				context.saveError(
					camera,
					error instanceof Error ? error.message : "ffmpeg failed.",
				);
			}
		}
	}

	/** The ffmpeg arguments for a camera: HLS into `live` for the live view, and five-minute MP4 files into `recordings` when it records. */
	arguments(
		url: string,
		folders: { live: string; recordings: string },
		record: boolean,
	): string[] {
		const { live, recordings } = folders;
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

	async #keepRunning(
		context: PluginContext,
		camera: PluginDevice,
		now: Date,
	): Promise<void> {
		const url = camera.secret("url");
		if (!url) {
			throw new Error("This camera has no RTSP address.");
		}
		const record = camera.fields.record === true;
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
		const folders = {
			live: context.folder(camera.id, "live"),
			recordings: context.folder(camera.id, "recordings"),
		};
		const failures = watch?.key === key ? watch.failures + 1 : 0;
		const ffmpeg = Bun.which("ffmpeg");
		if (!ffmpeg) {
			throw new Error("ffmpeg isn't installed on the server.");
		}
		const process = Bun.spawn(
			[ffmpeg, ...this.arguments(url, folders, record)],
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
		context.logger.info("Camera stream started", { camera: camera.id, record });
	}

	async #prune(
		context: PluginContext,
		camera: PluginDevice,
		now: Date,
	): Promise<void> {
		const days = camera.fields.retentionDays;
		const keepDays = typeof days === "number" ? days : 7;
		const before = now.getTime() - keepDays * 24 * 60 * 60_000;
		const folder = context.folder(camera.id, "recordings");
		for (const recording of await this.recordings(folder)) {
			if (Date.parse(recording.startedAt) < before) {
				await rm(join(folder, recording.file), { force: true });
			}
		}
	}

	async #state(
		context: PluginContext,
		camera: PluginDevice,
	): Promise<CameraState> {
		const index = Bun.file(
			join(context.folder(camera.id, "live"), "index.m3u8"),
		);
		const fresh =
			(await index.exists()) && Date.now() - index.lastModified < 30_000;
		const latest = (
			await this.recordings(context.folder(camera.id, "recordings"))
		)[0];
		return {
			type: "camera",
			streaming: fresh,
			recording: camera.fields.record === true && fresh,
			lastRecordingAt: latest?.startedAt ?? null,
			source: null,
			live: { format: "hls", path: "live/index.m3u8" },
			snapshot: null,
		};
	}

	#startOf(name: string): Date {
		const [date = "", time = ""] = name.replace(".mp4", "").split("_");
		return new Date(`${date}T${time.replaceAll("-", ":")}Z`);
	}
}

export default definePlugin(new Cameras());
