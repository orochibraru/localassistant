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
const reachTimeoutMs = 5000;
const probeTimeoutMs = 20_000;

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

	/**
	 * The camera the form describes, known by a digest of its address so a re-add finds it again.
	 *
	 * @throws When the address isn't one ffmpeg can read.
	 */
	add(values: PluginValues): FoundDevice {
		const url = String(values.url);
		return {
			kind: "camera",
			externalId: new Bun.CryptoHasher("sha256")
				.update(url)
				.digest("hex")
				.slice(0, 24),
			host: this.address(url).host,
		};
	}

	/**
	 * Tries an RTSP address before the camera is added: that it reads as one, that something answers on its port, and
	 * which stream ffprobe finds there.
	 *
	 * @throws With what's wrong and how to fix it, never repeating the password.
	 */
	async test(values: PluginValues): Promise<string> {
		const url = String(values.url ?? "");
		const { host, port } = this.address(url);
		await this.#reach(host, port);
		return await this.#probe(url);
	}

	/**
	 * The host and port an RTSP address points at, 554 when it names none (322 for rtsps).
	 *
	 * @throws When the address isn't one ffmpeg can read, saying which part is wrong.
	 */
	address(url: string): { host: string; port: number } {
		const match = /^(rtsps?):\/\/([^/?#]*)/i.exec(url.trim());
		if (!match) {
			throw new Error(
				"It has to start with rtsp:// or rtsps://, like rtsp://user:password@192.168.1.60:554/stream1.",
			);
		}
		const [, scheme = "", authority = ""] = match;
		const at = authority.lastIndexOf("@");
		const credentials = at === -1 ? "" : authority.slice(0, at);
		const location = authority.slice(at + 1);
		if (at === -1 && /@/.test(url)) {
			throw new Error(
				"The password has a /, ? or # in it: write / as %2F, ? as %3F and # as %23.",
			);
		}
		if (credentials.includes("@")) {
			throw new Error("The user or password has an @ in it: write it as %40.");
		}
		if (credentials && !credentials.includes(":")) {
			throw new Error(
				"There's a user but no password: write user:password@ before the address.",
			);
		}
		if (!location) {
			throw new Error("There's no camera address after rtsp://.");
		}
		let parsed: URL;
		try {
			parsed = new URL(`http://${location}`);
		} catch {
			throw new Error(
				`${location} isn't an address and port, like 192.168.1.60:554.`,
			);
		}
		if (!parsed.hostname) {
			throw new Error("There's no camera address after rtsp://.");
		}
		const fallback = scheme.toLowerCase() === "rtsps" ? 322 : 554;
		return {
			host: parsed.hostname.replace(/^\[|\]$/g, ""),
			port: parsed.port ? Number(parsed.port) : fallback,
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
				this.#keepRunning(context, camera, now);
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

	/** Opens and closes a TCP connection to the camera; throws, saying what happened, when nothing answers. */
	async #reach(host: string, port: number): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timedOut = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() =>
					reject(
						new Error(
							`Nothing answers on ${host}:${port} within five seconds. Check the address, the port, and that the camera is on the server's network.`,
						),
					),
				reachTimeoutMs,
			);
		});
		const opened = Bun.connect({
			hostname: host,
			port,
			socket: {
				open: (socket) => {
					socket.end();
				},
				data: () => undefined,
			},
		}).then(
			() => undefined,
			(failure: unknown) => {
				const reason = failure instanceof Error ? failure.message : "";
				const code =
					failure instanceof Error && "code" in failure ? failure.code : null;
				throw new Error(
					code === "ECONNREFUSED" || /refused/i.test(reason)
						? `${host}:${port} refused the connection: wrong port, or RTSP is off on the camera.`
						: `The server can't reach ${host}:${port}: ${reason || "no route"}.`,
					{ cause: failure },
				);
			},
		);
		try {
			await Promise.race([opened, timedOut]);
		} finally {
			clearTimeout(timer);
		}
	}

	/** Asks ffprobe what `url` streams; throws with the camera's answer, credentials hidden, when it can't play. */
	async #probe(url: string): Promise<string> {
		const ffprobe = Bun.which("ffprobe");
		if (!ffprobe) {
			throw new Error("ffprobe isn't installed on the server.");
		}
		const probe = Bun.spawn(
			[
				ffprobe,
				"-hide_banner",
				"-v",
				"error",
				"-rtsp_transport",
				"tcp",
				"-show_entries",
				"stream=codec_type,codec_name,width,height,avg_frame_rate",
				"-of",
				"json",
				url,
			],
			{ stdout: "pipe", stderr: "pipe", timeout: probeTimeoutMs },
		);
		const [output, errors] = await Promise.all([
			new Response(probe.stdout).text(),
			new Response(probe.stderr).text(),
			probe.exited,
		]);
		if (probe.signalCode) {
			throw new Error(
				"The camera accepted the connection but sent no video within twenty seconds. Check the stream path.",
			);
		}
		if (probe.exitCode !== 0) {
			throw new Error(this.probeFailure(errors, url));
		}
		return this.probeSummary(output);
	}

	/** What ffprobe's JSON says the stream is, for a person: codec, size, frame rate and audio. */
	probeSummary(output: string): string {
		const { streams = [] } = JSON.parse(output || "{}") as {
			streams?: {
				codec_type?: string;
				codec_name?: string;
				width?: number;
				height?: number;
				avg_frame_rate?: string;
			}[];
		};
		const video = streams.find((stream) => stream.codec_type === "video");
		if (!video) {
			throw new Error("The camera answered, but with no video stream.");
		}
		const [frames = 0, seconds = 1] = (video.avg_frame_rate ?? "0/1")
			.split("/")
			.map(Number);
		const rate = seconds > 0 ? Math.round(frames / seconds) : 0;
		const audio = streams.find((stream) => stream.codec_type === "audio");
		return [
			`It works: ${(video.codec_name ?? "video").toUpperCase()}`,
			video.width && video.height ? ` ${video.width}x${video.height}` : "",
			rate > 0 ? ` at ${rate} fps` : "",
			audio
				? `, with ${(audio.codec_name ?? "").toUpperCase()} audio.`
				: ", no audio.",
		].join("");
	}

	/** ffprobe's error for a person: the usual camera answers explained, anything else as ffprobe said it, credentials hidden. */
	probeFailure(errors: string, url: string): string {
		if (/401|unauthorized/i.test(errors)) {
			return "The camera refused the user or password (401). On a Tapo it's the camera account set in the app's advanced settings, not the TP-Link one.";
		}
		if (/404|not found/i.test(errors)) {
			return "The camera has no stream at that path (404). Tapo: /stream1 or /stream2. Reolink: /h264Preview_01_main.";
		}
		if (/connection refused/i.test(errors)) {
			return "The camera refused the RTSP connection: check the port and that RTSP is on.";
		}
		const secret = /^rtsps?:\/\/([^/?#]*)@/i.exec(url)?.[1];
		const line =
			errors
				.trim()
				.split(/\r?\n/)
				.at(-1)
				?.replaceAll(`${url}: `, "")
				.replaceAll(url, "the address") ?? "";
		const hidden = secret ? line.replaceAll(secret, "user:***") : line;
		return `ffprobe couldn't play it: ${hidden || "no reason given"}.`;
	}

	#keepRunning(context: PluginContext, camera: PluginDevice, now: Date): void {
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
