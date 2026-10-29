import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { setSetting } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { cameras } from "#lib/server/devices/cameras.js";
import { frigate } from "#lib/server/devices/frigate.js";
import { fileResponse } from "#lib/server/http/file-response.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";
import { cameraSchema, frigateSchema } from "#lib/server/validation/device.js";

import { createUser, homeId, resetDatabase } from "../../database.js";

const root = await mkdtemp(join(tmpdir(), "localassistant-cameras-"));
const fakeFolder = () =>
	spyOn(cameras, "folder").mockImplementation((deviceId, part) =>
		join(root, deviceId, part),
	);
let folder = fakeFolder();

afterAll(async () => {
	folder.mockRestore();
	await rm(root, { recursive: true, force: true });
});

function addCamera(record = true) {
	return DeviceDTO.upsert({
		kind: "camera",
		homeId: homeId(),
		name: "Front door",
		externalId: crypto.randomUUID(),
		host: "192.0.2.60",
		encryptedLocalKey: secrets.encrypt(
			"rtsp://user:secret@192.0.2.60:554/stream1",
		),
		options: { record, retentionDays: 2 },
	});
}

describe("cameras", () => {
	beforeEach(resetDatabase);

	test("ffmpeg writes HLS and, when recording, five-minute MP4 files", () => {
		const live = cameras.arguments("rtsp://camera/stream1", "camera-1", false);
		expect(live).toContain("hls");
		expect(live).not.toContain("segment");
		const recorded = cameras.arguments(
			"rtsp://camera/stream1",
			"camera-1",
			true,
		);
		expect(recorded).toContain("segment");
		expect(recorded.at(-1)).toEndWith(
			join("camera-1", "recordings", "%Y-%m-%d_%H-%M-%S.mp4"),
		);
	});

	test("only serves the files it writes", () => {
		folder.mockRestore();
		expect(cameras.folder("camera-1", "live")).toEndWith(
			join("cameras", "camera-1", "live"),
		);
		folder = fakeFolder();
		expect(cameras.file("camera-1", "live", "index.m3u8")).toEndWith(
			join("live", "index.m3u8"),
		);
		expect(cameras.file("camera-1", "live", "segment-12.ts")).not.toBeNull();
		expect(
			cameras.file("camera-1", "recordings", "2026-10-28_10-00-00.mp4"),
		).not.toBeNull();
		expect(
			cameras.file("camera-1", "recordings", "../../secrets.mp4"),
		).toBeNull();
		expect(cameras.file("../etc", "live", "index.m3u8")).toBeNull();
		expect(cameras.file("camera-1", "live", "index.html")).toBeNull();
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
		const recordings = cameras.folder(camera.id, "recordings");
		await mkdir(recordings, { recursive: true });
		await writeFile(join(recordings, "2020-01-01_00-00-00.mp4"), "old");
		await writeFile(join(recordings, "2026-10-28_10-00-00.mp4"), "new");
		const now = new Date("2026-10-28T12:00:00Z");
		await cameras.sync(now);
		expect(started).toBe(1);
		expect(await readdir(recordings)).toEqual(["2026-10-28_10-00-00.mp4"]);
		expect(DeviceDTO.find(camera.id)?.state).toMatchObject({
			type: "camera",
			streaming: false,
			lastRecordingAt: "2026-10-28T10:00:00.000Z",
		});
		await cameras.sync(now);
		expect(started).toBe(1);
		const live = cameras.folder(camera.id, "live");
		await writeFile(join(live, "index.m3u8"), "#EXTM3U");
		camera.setOptions({ record: false, retentionDays: 2 });
		await cameras.sync(now);
		expect(started).toBe(2);
		expect(killed).toEqual([1]);
		expect(DeviceDTO.find(camera.id)?.state).toMatchObject({
			streaming: true,
			recording: false,
		});
		expect(await cameras.recordings(camera.id)).toHaveLength(1);
		expect(await cameras.recordings("missing")).toEqual([]);

		DeviceDTO.upsert({
			kind: "camera",
			homeId: homeId(),
			name: "Broken",
			externalId: "broken",
		});
		camera.delete();
		await jobHandlers["cameras.sync"]({});
		expect(killed).toEqual([1, 2]);
		expect(DeviceDTO.all()[0]?.toJSON().stateError).toBe(
			"This camera has no RTSP address.",
		);
		cameras.stopAll();
		which.mockReturnValue(null);
		addCamera();
		await cameras.sync(now);
		expect(
			DeviceDTO.all()
				.find((device) => device.toJSON().name === "Front door")
				?.toJSON().stateError,
		).toBe("ffmpeg isn't installed on the server.");
		which.mockRestore();
		spawn.mockRestore();
		await utimes(join(live, "index.m3u8"), new Date(0), new Date(0));
	});

	test("files answer whole or by range", async () => {
		const path = join(root, "clip.mp4");
		await writeFile(path, "0123456789");
		const whole = await fileResponse(
			Bun.file(path),
			new Request("http://x/"),
			"no-store",
		);
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
			fileResponse(
				Bun.file(join(root, "gone.mp4")),
				new Request("http://x/"),
				"no-store",
			),
		).rejects.toMatchObject({ status: 404 });
	});
});

describe("Frigate", () => {
	beforeEach(resetDatabase);

	test("imports cameras, lists events, proxies media and pushes new detections once", async () => {
		const fetched: { url: string; range: string | null }[] = [];
		const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
			input: string,
			init?: RequestInit,
		) => {
			fetched.push({
				url: input,
				range: new Headers(init?.headers).get("range"),
			});
			if (input.endsWith("/api/config")) {
				return Response.json({ cameras: { front_door: {}, garden: {} } });
			}
			if (input.includes("/api/events?")) {
				return Response.json([
					{
						id: "1.5-abc",
						label: "person",
						top_score: 0.9,
						start_time: 1_793_000_000,
						end_time: null,
						has_clip: true,
						has_snapshot: true,
					},
				]);
			}
			if (input.includes("/clip.mp4")) {
				return new Response("part", {
					status: 206,
					headers: {
						"content-type": "video/mp4",
						"content-range": "bytes 0-3/10",
					},
				});
			}
			return new Response("nope", { status: 500 });
		}) as unknown as typeof fetch);

		expect(
			frigateSchema.parse({
				url: "http://frigate.local:5000",
				notifyLabels: "Person, car, 1nvalid",
			}),
		).toEqual({
			url: "http://frigate.local:5000",
			notifyLabels: ["person", "car"],
		});
		expect(
			cameraSchema.safeParse({ name: "Door", url: "http://nope" }).success,
		).toBe(false);
		expect(frigate.import()).rejects.toThrow("Connect Frigate first.");
		setSetting("frigate", {
			url: "http://frigate.local:5000/",
			homeId: homeId(),
			notifyLabels: ["person"],
		});
		expect(await frigate.import()).toBe(2);
		expect(await frigate.import()).toBe(2);
		expect(
			DeviceDTO.inHome(homeId())
				.map((device) => device.toJSON().name)
				.toSorted(),
		).toEqual(["Front door", "Garden"]);
		expect(await frigate.events("front_door")).toEqual([
			{
				id: "1.5-abc",
				label: "person",
				score: 0.9,
				startedAt: new Date(1_793_000_000_000).toISOString(),
				endedAt: null,
				hasClip: true,
				hasSnapshot: true,
			},
		]);
		const clip = await frigate.proxy(
			"/api/events/1.5-abc/clip.mp4",
			new Request("http://x/", { headers: { range: "bytes=0-3" } }),
		);
		expect(clip.status).toBe(206);
		expect(clip.headers.get("content-range")).toBe("bytes 0-3/10");
		expect(fetched.at(-1)?.range).toBe("bytes=0-3");
		expect(
			frigate.proxy("/api/front_door/latest.jpg", new Request("http://x/")),
		).rejects.toThrow("Frigate answered 500.");

		createUser("ada");
		const event = (label: string, type = "new") => ({
			type,
			after: { camera: "front_door", label },
		});
		const now = Date.now();
		frigate.alert(event("person"), now);
		frigate.alert(event("person"), now + 60_000);
		frigate.alert(event("car"), now);
		frigate.alert(event("person", "update"), now + 1_000_000);
		frigate.alert(
			{ type: "new", after: { camera: "nowhere", label: "person" } },
			now + 2_000_000,
		);
		frigate.alert(null);
		expect(JobDTO.isQueued("push.send")).toBe(true);
		fetchSpy.mockRejectedValue(new Error("offline"));
		expect(
			frigate.cameraNames({ url: "http://frigate.local:5000" }),
		).rejects.toThrow("can't be reached");
		fetchSpy.mockRestore();
	});
});
