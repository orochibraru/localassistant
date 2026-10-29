import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { setPluginSettings } from "#lib/dto/setting.js";
import type { CameraClips } from "#lib/plugin-sdk.js";
import { broker } from "#lib/server/devices/broker.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";

import { createUser, homeId, resetDatabase } from "../database.js";
import { hosted, pluginOf, seen } from "./support.js";

const frigate = pluginOf<{
	alert(context: unknown, payload: unknown, now?: number): void;
	cameraNames(url: string): Promise<string[]>;
}>("frigate");
const context = hosted("frigate").context;

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

		expect(frigate.discover?.(context)).rejects.toThrow(
			"Connect Frigate first.",
		);
		const found = await pluginSetup.connect(hosted("frigate"), homeId(), {
			url: "http://frigate.local:5000/",
			notifyLabels: "Person, car",
		});
		expect(found).toBe(2);
		expect(await pluginSetup.discover(hosted("frigate"))).toBe(0);
		const names = DeviceDTO.inHome(homeId())
			.map((device) => device.toJSON().name)
			.toSorted();
		expect(names).toEqual(["Front door", "Garden"]);
		const door = DeviceDTO.inHome(homeId()).find(
			(device) => device.externalId === "front_door",
		) as DeviceDTO;
		expect(door.state).toMatchObject({
			type: "camera",
			source: "Frigate",
			live: { format: "image", path: "stream" },
			snapshot: "latest.jpg",
		});
		const clips = (await frigate.clips?.(seen(door), context)) as CameraClips;
		expect(clips.clips).toEqual([
			{
				id: "1.5-abc",
				label: "person",
				startedAt: new Date(1_793_000_000_000).toISOString(),
				video: "events/1.5-abc/clip.mp4",
				image: "events/1.5-abc/thumbnail.jpg",
				detail: null,
			},
		]);
		const clip = await frigate.serve?.(
			seen(door),
			"events/1.5-abc/clip.mp4",
			new Request("http://x/", { headers: { range: "bytes=0-3" } }),
			context,
		);
		expect(clip?.status).toBe(206);
		expect(clip?.headers.get("content-range")).toBe("bytes 0-3/10");
		expect(fetched.at(-1)?.range).toBe("bytes=0-3");
		expect(
			frigate.serve?.(
				seen(door),
				"latest.jpg",
				new Request("http://x/"),
				context,
			),
		).rejects.toThrow("Frigate answered 500.");
		const refused = await frigate.serve?.(
			seen(door),
			"events/../x/clip.mp4",
			new Request("http://x/"),
			context,
		);
		expect(refused?.status).toBe(404);

		createUser("ada");
		const event = (label: string, type = "new") => ({
			type,
			after: { camera: "front_door", label },
		});
		const now = Date.now();
		frigate.alert(context, event("person"), now);
		frigate.alert(context, event("person"), now + 60_000);
		frigate.alert(context, event("dog"), now);
		frigate.alert(context, event("person", "update"), now + 1_000_000);
		frigate.alert(
			context,
			{ type: "new", after: { camera: "nowhere", label: "person" } },
			now + 2_000_000,
		);
		frigate.alert(context, null);
		expect(JobDTO.isQueued("push.send")).toBe(true);
		fetchSpy.mockRejectedValue(new Error("offline"));
		expect(frigate.cameraNames("http://frigate.local:5000")).rejects.toThrow(
			"can't be reached",
		);
		fetchSpy.mockRestore();
	});

	test("listens to detections once Frigate is connected, broker or not yet", async () => {
		const subscribe = spyOn(broker, "subscribe");
		await plugins.restart("frigate");
		expect(subscribe).not.toHaveBeenCalled();
		setPluginSettings("frigate", {
			homeId: homeId(),
			values: { url: "http://frigate.local:5000", notifyLabels: "person" },
			secrets: {},
		});
		await plugins.restart("frigate");
		expect(subscribe).toHaveBeenCalledWith(
			"frigate",
			"frigate/events",
			expect.any(Function),
		);
		const listener = subscribe.mock.calls[0]?.[2];
		await listener?.("frigate/events", Buffer.from("not json"));
		await listener?.("frigate/events", Buffer.from("{}"));
		await plugins.stop("frigate");
		subscribe.mockRestore();
	});
});
