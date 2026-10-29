import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DeviceDTO } from "#lib/dto/device.js";
import type { CameraClips } from "#lib/plugin-sdk.js";
import { fileResponse } from "#lib/server/http/file-response.js";
import { plugins } from "#lib/server/plugins/registry.js";

import { resetDatabase } from "../database.js";
import { addDevice, hosted, pluginOf, seen } from "./support.js";

const root = await mkdtemp(join(tmpdir(), "localassistant-cameras-"));
const context = hosted("camera").context;
const folder = spyOn(context, "folder").mockImplementation((...parts) => {
	const path = join(root, ...parts);
	mkdirSync(path, { recursive: true });
	return path;
});
const cameras = pluginOf<{
	arguments(
		url: string,
		folders: { live: string; recordings: string },
		record: boolean,
	): string[];
	sync(context: unknown, now?: Date): Promise<void>;
}>("camera");

afterAll(async () => {
	folder.mockRestore();
	await rm(root, { recursive: true, force: true });
});

function addCamera(record = true) {
	return addDevice({
		kind: "camera",
		name: "Front door",
		externalId: crypto.randomUUID(),
		host: "192.0.2.60",
		fields: { record, retentionDays: 2 },
		secrets: { url: "rtsp://user:secret@192.0.2.60:554/stream1" },
	});
}

const request = new Request("http://localhost/");

describe("cameras", () => {
	beforeEach(resetDatabase);

	test("ffmpeg writes HLS and, when recording, five-minute MP4 files", () => {
		const folders = { live: "/data/live", recordings: "/data/recordings" };
		const live = cameras.arguments("rtsp://camera/stream1", folders, false);
		expect(live).toContain("hls");
		expect(live).not.toContain("segment");
		const recorded = cameras.arguments("rtsp://camera/stream1", folders, true);
		expect(recorded).toContain("segment");
		expect(recorded.at(-1)).toBe(
			join("/data/recordings", "%Y-%m-%d_%H-%M-%S.mp4"),
		);
	});

	test("adds a camera under a digest of its address and its host", () => {
		const found = cameras.add?.(
			{ url: "rtsp://user:pass@192.0.2.61:554/stream1" },
			context,
		);
		expect(found).toMatchObject({ kind: "camera", host: "192.0.2.61" });
		expect(found).toEqual(
			cameras.add?.(
				{ url: "rtsp://user:pass@192.0.2.61:554/stream1" },
				context,
			),
		);
	});

	test("only serves the files it writes", async () => {
		const camera = seen(addCamera());
		await writeFile(
			join(context.folder(camera.id, "live"), "index.m3u8"),
			"#EXTM3U",
		);
		const live = await cameras.serve?.(
			camera,
			"live/index.m3u8",
			request,
			context,
		);
		expect(live?.status).toBe(200);
		expect(live?.headers.get("cache-control")).toBe("no-store");
		for (const path of [
			"recordings/../../secrets.mp4",
			"live/index.html",
			"elsewhere/index.m3u8",
		]) {
			expect(
				(await cameras.serve?.(camera, path, request, context))?.status,
			).toBe(404);
		}
	});

	test("sync starts ffmpeg once, restarts it on a change, prunes old files and stops removed cameras", async () => {
		const killed: number[] = [];
		const which = spyOn(Bun, "which").mockReturnValue("/usr/bin/ffmpeg");
		let started = 0;
		const spawn = spyOn(Bun, "spawn").mockImplementation((() => {
			const id = ++started;
			return { exitCode: null, kill: () => killed.push(id) };
		}) as unknown as typeof Bun.spawn);
		const camera = addCamera();
		const recordings = context.folder(camera.id, "recordings");
		await writeFile(join(recordings, "2020-01-01_00-00-00.mp4"), "old");
		await writeFile(join(recordings, "2026-10-28_10-00-00.mp4"), "new");
		const now = new Date("2026-10-28T12:00:00Z");
		await cameras.sync(context, now);
		expect(started).toBe(1);
		expect(await readdir(recordings)).toEqual(["2026-10-28_10-00-00.mp4"]);
		expect(DeviceDTO.find(camera.id)?.state).toMatchObject({
			type: "camera",
			streaming: false,
			lastRecordingAt: "2026-10-28T10:00:00.000Z",
			live: { format: "hls", path: "live/index.m3u8" },
		});
		await cameras.sync(context, now);
		expect(started).toBe(1);
		const live = context.folder(camera.id, "live");
		await writeFile(join(live, "index.m3u8"), "#EXTM3U");
		camera.configure({
			name: "Front door",
			roomId: null,
			externalId: camera.externalId,
			host: camera.host,
			fields: { record: false, retentionDays: 2 },
			encryptedSecrets: camera.encryptedSecrets(),
		});
		await cameras.sync(context, now);
		expect(started).toBe(2);
		expect(killed).toEqual([1]);
		expect(DeviceDTO.find(camera.id)?.state).toMatchObject({
			streaming: true,
			recording: false,
		});
		const clips = (await cameras.clips?.(seen(camera), context)) as CameraClips;
		expect(clips.clips).toMatchObject([
			{
				id: "2026-10-28_10-00-00.mp4",
				video: "recordings/2026-10-28_10-00-00.mp4",
				detail: "0 MB",
			},
		]);

		addDevice({ kind: "camera", name: "Broken", externalId: "broken" });
		camera.delete();
		await cameras.sync(context, now);
		expect(killed).toEqual([1, 2]);
		expect(DeviceDTO.all()[0]?.toJSON().stateError).toBe(
			"This camera has no RTSP address.",
		);
		await cameras.stop?.();
		which.mockReturnValue(null);
		addCamera();
		await cameras.sync(context, now);
		expect(
			DeviceDTO.all()
				.find((device) => device.toJSON().name === "Front door")
				?.toJSON().stateError,
		).toBe("ffmpeg isn't installed on the server.");
		await plugins.start("camera");
		await plugins.stop("camera");
		which.mockRestore();
		spawn.mockRestore();
		await utimes(join(live, "index.m3u8"), new Date(0), new Date(0));
	});

	test("files answer whole or by range", async () => {
		const path = join(root, "clip.mp4");
		await writeFile(path, "0123456789");
		const whole = await fileResponse(Bun.file(path), request, "no-store");
		expect(whole.status).toBe(200);
		expect(whole.headers.get("content-type")).toBe("video/mp4");
		const part = await fileResponse(
			Bun.file(path),
			new Request("http://x/", { headers: { range: "bytes=2-5" } }),
			"no-store",
		);
		expect(part.status).toBe(206);
		expect(await part.text()).toBe("2345");
		const tail = await fileResponse(
			Bun.file(path),
			new Request("http://x/", { headers: { range: "bytes=-3" } }),
			"no-store",
		);
		expect(await tail.text()).toBe("789");
		const outside = await fileResponse(
			Bun.file(path),
			new Request("http://x/", { headers: { range: "bytes=50-" } }),
			"no-store",
		);
		expect(outside.status).toBe(416);
		expect(
			fileResponse(Bun.file(join(root, "gone.mp4")), request, "no-store"),
		).rejects.toMatchObject({ status: 404 });
	});
});
