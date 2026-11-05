import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	spyOn,
	test,
} from "bun:test";
import { EventEmitter } from "node:events";
import { Duplex } from "node:stream";
import type { TLSSocket } from "node:tls";

import type { MulticastDNS } from "multicast-dns";

import { DeviceDTO } from "#lib/dto/device.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";
import {
	CastClient,
	castClient,
	CastConnection,
	castNamespaces,
	type CastPayload,
} from "#plugins/cast/connection.js";
import { CastDiscovery, castDiscovery } from "#plugins/cast/discovery.js";
import { castMapping, serviceName } from "#plugins/cast/mapping.js";
import { castProtocol } from "#plugins/cast/protocol.js";

import { homeId, resetDatabase } from "../database.js";
import { addDevice, hosted, pluginOf, seen } from "./support.js";

const plugin = pluginOf<{ keepConnected(context: unknown): Promise<void> }>(
	"cast",
);
const context = hosted("cast").context;

const instance = `Chromecast-0123._googlecast._tcp.local`;

function receiverStatus(
	overrides: Record<string, unknown> = {},
	applications: Record<string, unknown>[] = [
		{
			appId: "AndroidNativeApp",
			displayName: "Spotify",
			isIdleScreen: false,
			namespaces: [{ name: castNamespaces.media }],
			sessionId: "session-1",
			transportId: "transport-1",
		},
	],
): CastPayload {
	return {
		type: "RECEIVER_STATUS",
		status: {
			applications,
			isStandBy: false,
			volume: { controlType: "attenuation", level: 0.35, muted: false },
			...overrides,
		},
	};
}

function mediaStatus(overrides: Record<string, unknown> = {}): CastPayload {
	return {
		type: "MEDIA_STATUS",
		status: [
			{
				mediaSessionId: 4,
				playerState: "PLAYING",
				supportedMediaCommands: 207,
				media: {
					metadata: {
						title: "A song",
						artist: "A band",
						images: [{ url: "https://example.com/cover.jpg" }],
					},
				},
				...overrides,
			},
		],
	};
}

class FakeDevice {
	receiver = receiverStatus();
	media: CastPayload | null = mediaStatus();
	received: { destination: string; payload: CastPayload }[] = [];
	readonly socket: Duplex;
	#buffer = Buffer.alloc(0);

	constructor() {
		this.socket = new Duplex({
			read: () => {},
			write: (chunk: Buffer, _encoding, callback) => {
				this.#receive(chunk);
				callback();
			},
		});
	}

	push(namespace: string, payload: CastPayload, source = "receiver-0"): void {
		this.socket.push(
			castProtocol.encode({
				sourceId: source,
				destinationId: "sender-0",
				namespace,
				payload: JSON.stringify(payload),
			}),
		);
	}

	#receive(chunk: Buffer): void {
		const frames = castProtocol.split(Buffer.concat([this.#buffer, chunk]));
		this.#buffer = Buffer.from(frames.rest);
		for (const body of frames.bodies) {
			const message = castProtocol.decode(body);
			if (message) {
				const payload = JSON.parse(message.payload) as CastPayload;
				this.received.push({ destination: message.destinationId, payload });
				this.#answer(message.namespace, message.destinationId, payload);
			}
		}
	}

	#answer(namespace: string, destination: string, payload: CastPayload): void {
		const requestId = payload.requestId;
		if (namespace === castNamespaces.heartbeat && payload.type === "PING") {
			this.push(namespace, { type: "PONG" });
		} else if (namespace === castNamespaces.receiver) {
			this.push(namespace, { ...this.receiver, requestId });
		} else if (namespace === castNamespaces.media) {
			this.push(
				namespace,
				{ ...(this.media ?? { status: [] }), requestId },
				destination,
			);
		}
	}
}

let fake: FakeDevice;

function speaker() {
	return addDevice({
		kind: "cast",
		name: "Living room TV",
		externalId: "0123",
		host: "192.0.2.40",
		fields: { port: 8009 },
	});
}

beforeEach(() => {
	resetDatabase();
	fake = new FakeDevice();
	spyOn(castClient, "open").mockImplementation(() =>
		Promise.resolve(new CastConnection(fake.socket)),
	);
});

afterEach(async () => {
	await plugin.stop?.();
	mock.restore();
	jest.useRealTimers();
});

describe("Cast protocol", () => {
	test("encodes and decodes a framed CastMessage", () => {
		const message = {
			sourceId: "sender-0",
			destinationId: "receiver-0",
			namespace: castNamespaces.receiver,
			payload: JSON.stringify({ type: "GET_STATUS", note: "é".repeat(200) }),
		};
		const framed = castProtocol.encode(message);
		expect(framed.readUInt32BE(0)).toBe(framed.length - 4);
		const { bodies, rest } = castProtocol.split(framed);
		expect(rest.length).toBe(0);
		expect(bodies).toHaveLength(1);
		expect(castProtocol.decode(bodies[0] ?? Buffer.alloc(0))).toEqual(message);
	});

	test("waits for the rest of a frame and splits two at once", () => {
		const first = castProtocol.encode({
			sourceId: "a",
			destinationId: "b",
			namespace: "n",
			payload: "{}",
		});
		const second = castProtocol.encode({
			sourceId: "c",
			destinationId: "d",
			namespace: "n",
			payload: "[]",
		});
		const both = Buffer.concat([first, second]);
		const partial = castProtocol.split(both.subarray(0, first.length + 3));
		expect(partial.bodies).toHaveLength(1);
		expect(partial.rest.length).toBe(3);
		expect(castProtocol.split(both).bodies).toHaveLength(2);
	});

	test("skips unknown fields and refuses binary or broken messages", () => {
		const body = castProtocol.split(
			castProtocol.encode({
				sourceId: "s",
				destinationId: "d",
				namespace: "n",
				payload: "{}",
			}),
		).bodies[0];
		const withExtra = Buffer.concat([
			body ?? Buffer.alloc(0),
			Buffer.from([0x40, 0x01, 0x49, 1, 2, 3, 4, 5, 6, 7, 8, 0x55, 1, 2, 3, 4]),
		]);
		expect(castProtocol.decode(withExtra)?.payload).toBe("{}");
		expect(castProtocol.decode(Buffer.from([0x3a, 0x01, 0x00]))).toBeNull();
		expect(castProtocol.decode(Buffer.from([0x32, 0x09, 0x00]))).toBeNull();
		expect(castProtocol.decode(Buffer.from([0x0b]))).toBeNull();
		expect(castProtocol.decode(Buffer.from([0x80]))).toBeNull();
	});

	test("refuses a frame too large to be a Cast message", () => {
		const header = Buffer.alloc(4);
		header.writeUInt32BE(1_000_000);
		expect(() => castProtocol.split(header)).toThrow("too large");
	});
});

describe("Cast discovery", () => {
	test("turns mDNS records into devices", () => {
		const records = [
			{ type: "PTR", name: serviceName, data: instance },
			{ type: "PTR", name: serviceName, data: instance },
			{
				type: "TXT",
				name: instance,
				data: [
					Buffer.from("id=0123"),
					Buffer.from("md=Chromecast"),
					Buffer.from("fn=Living room TV"),
					Buffer.from("broken"),
				],
			},
			{
				type: "SRV",
				name: instance,
				data: { port: 8009, target: "0123.local" },
			},
			{ type: "A", name: "0123.local", data: "192.0.2.40" },
			{ type: "PTR", name: serviceName, data: "Group._googlecast._tcp.local" },
			{
				type: "TXT",
				name: "Group._googlecast._tcp.local",
				data: ["id=4567", "md=Google Cast Group"],
			},
			{
				type: "SRV",
				name: "Group._googlecast._tcp.local",
				data: { port: 32187, target: "0123.local" },
			},
			{ type: "PTR", name: serviceName, data: "Lost._googlecast._tcp.local" },
			{ type: "TXT", name: "Lost._googlecast._tcp.local", data: "id=89" },
			{ type: "PTR", name: "_airplay._tcp.local", data: "Other" },
		];
		expect(castMapping.found(records)).toEqual([
			{
				kind: "cast",
				externalId: "0123",
				name: "Living room TV",
				host: "192.0.2.40",
				fields: { model: "Chromecast", port: 8009 },
			},
			{
				kind: "cast",
				externalId: "4567",
				name: "Google Cast Group",
				host: "192.0.2.40",
				fields: { model: "Google Cast Group", port: 32187 },
			},
		]);
	});
});

describe("Cast status", () => {
	test("maps the receiver and media status to the media card", () => {
		expect(castMapping.state(receiverStatus(), mediaStatus())).toEqual({
			type: "media",
			power: true,
			playback: "playing",
			title: "A song",
			artist: "A band",
			volume: 35,
			muted: false,
			source: "Spotify",
			sources: [],
		});
	});

	test("reads a standby TV, a fixed volume and an app without media", () => {
		const state = castMapping.state(
			receiverStatus({
				isStandBy: true,
				volume: { controlType: "fixed", level: 1, muted: false },
			}),
			mediaStatus({
				playerState: "PAUSED",
				media: { metadata: { title: "Episode", seriesTitle: "A show" } },
			}),
		);
		expect(state).toMatchObject({
			power: false,
			playback: "paused",
			title: "Episode",
			artist: "A show",
			volume: null,
			muted: null,
		});
		expect(
			castMapping.state(
				receiverStatus({}, [
					{ appId: "Netflix", displayName: "Netflix", namespaces: [] },
				]),
				null,
			),
		).toMatchObject({ power: true, playback: "idle", title: null });
	});

	test("ignores the idle screen", () => {
		const idle = receiverStatus({}, [
			{ appId: "E8C28D3C", displayName: "Backdrop", isIdleScreen: true },
		]);
		expect(castMapping.application(idle)).toBeNull();
		expect(castMapping.state(idle, null)).toMatchObject({
			power: false,
			playback: null,
			source: null,
		});
		expect(castMapping.state({}, null).volume).toBeNull();
	});
});

describe("Cast commands", () => {
	test("turns media changes into Cast requests", () => {
		expect(
			castMapping.requests(
				{ volume: 120, muted: true, action: "pause", power: false },
				receiverStatus(),
				mediaStatus(),
			),
		).toEqual([
			{
				target: "receiver",
				payload: { type: "STOP", sessionId: "session-1" },
			},
			{
				target: "receiver",
				payload: { type: "SET_VOLUME", volume: { level: 1 } },
			},
			{
				target: "receiver",
				payload: { type: "SET_VOLUME", volume: { muted: true } },
			},
			{ target: "media", payload: { type: "PAUSE", mediaSessionId: 4 } },
		]);
		expect(
			castMapping.requests({ power: true }, receiverStatus({}, []), null),
		).toEqual([
			{ target: "receiver", payload: { type: "LAUNCH", appId: "CC1AD845" } },
		]);
		expect(
			castMapping.requests(
				{ action: "previous" },
				receiverStatus(),
				mediaStatus(),
			),
		).toEqual([
			{
				target: "media",
				payload: { type: "QUEUE_UPDATE", mediaSessionId: 4, jump: -1 },
			},
		]);
	});

	test("refuses what the device or its app can't do", () => {
		expect(() =>
			castMapping.requests(
				{ action: "next" },
				receiverStatus(),
				mediaStatus({ supportedMediaCommands: 1 }),
			),
		).toThrow("can't skip to the next track");
		expect(() =>
			castMapping.requests({ action: "play" }, receiverStatus(), null),
		).toThrow("Nothing is playing");
		expect(() =>
			castMapping.requests({ source: "Netflix" }, receiverStatus(), null),
		).toThrow("can't switch apps");
	});
});

describe("Cast plugin", () => {
	test("shows Cast devices on the media card", () => {
		expect(plugins.catalog().cast).toMatchObject({
			card: "media",
			icon: "tv",
		});
	});

	test("turns on with no settings and finds devices on the find button", async () => {
		spyOn(castDiscovery, "browse").mockResolvedValue([
			{
				kind: "cast",
				externalId: "0123",
				name: "Kitchen speaker",
				host: "192.0.2.40",
			},
		]);
		expect(await pluginSetup.connect(hosted("cast"), homeId(), {})).toBe(1);
		expect(await pluginSetup.discover(hosted("cast"))).toBe(0);
		expect(DeviceDTO.all().map((device) => device.name)).toEqual([
			"Kitchen speaker",
		]);
	});

	test("reads a device over its channel", async () => {
		const device = speaker();
		const state = await plugin.read?.(seen(device), context);
		expect(state).toMatchObject({ title: "A song", volume: 35 });
		expect(fake.received.map((entry) => entry.payload.type)).toEqual([
			"CONNECT",
			"GET_STATUS",
			"CONNECT",
			"GET_STATUS",
		]);
		expect(fake.received[2]?.destination).toBe("transport-1");
	});

	test("sends a change to the app's transport and returns the new state", async () => {
		const device = speaker();
		const state = await plugin.command?.(
			seen(device),
			{ type: "media", change: { action: "pause", volume: 20 } },
			context,
		);
		expect(state).toMatchObject({ type: "media", source: "Spotify" });
		expect(
			fake.received
				.filter((entry) =>
					["PAUSE", "SET_VOLUME"].includes(String(entry.payload.type)),
				)
				.map((entry) => entry.destination),
		).toEqual(["receiver-0", "transport-1"]);
		await expect(
			plugin.command?.(seen(device), { type: "switch", on: true }, context),
		).rejects.toThrow("only takes media changes");
	});

	test("says what a device runs before adding it", async () => {
		spyOn(globalThis, "fetch").mockImplementation((() =>
			Promise.resolve(
				Response.json({ name: "Living room TV", ssdp_udn: "0123-4567" }),
			)) as unknown as typeof fetch);
		expect(await plugin.test?.({ host: "192.0.2.40" }, context)).toBe(
			"Living room TV answered, running Spotify.",
		);
		expect(await plugin.add?.({ host: "192.0.2.40" }, context)).toEqual({
			kind: "cast",
			externalId: "01234567",
			name: "Living room TV",
			host: "192.0.2.40",
			fields: { port: 8009 },
		});
	});

	test("adds a device by its address when it doesn't say its id", async () => {
		spyOn(globalThis, "fetch").mockRejectedValue(new Error("refused"));
		fake.receiver = receiverStatus({}, []);
		expect(await plugin.add?.({ host: "192.0.2.41" }, context)).toMatchObject({
			externalId: "192.0.2.41",
			name: undefined,
		});
		expect(await plugin.test?.({ host: "192.0.2.41" }, context)).toBe(
			"The Cast device answered, nothing is casting to it.",
		);
	});

	test("keeps a channel open and saves what the device pushes", async () => {
		const device = speaker();
		await plugin.keepConnected(context);
		expect(DeviceDTO.find(device.id)?.state).toMatchObject({ title: "A song" });
		fake.media = mediaStatus({ playerState: "PAUSED" });
		fake.push(
			castNamespaces.media,
			{ ...fake.media, requestId: 0 },
			"transport-1",
		);
		await Bun.sleep(700);
		expect(DeviceDTO.find(device.id)?.state).toMatchObject({
			playback: "paused",
		});
		const opened = fake.received.length;
		await plugin.keepConnected(context);
		expect(fake.received.length).toBe(opened);
	});

	test("records why a device can't be reached", async () => {
		const device = speaker();
		spyOn(castClient, "open").mockRejectedValue(new Error("Unplugged."));
		await plugin.keepConnected(context);
		expect(DeviceDTO.find(device.id)?.toJSON().stateError).toBe("Unplugged.");
	});
});

describe("Cast connection", () => {
	test("answers heartbeats and fails requests when it closes", async () => {
		const connection = new CastConnection(fake.socket);
		fake.push(castNamespaces.heartbeat, { type: "PING" });
		await Bun.sleep(10);
		expect(fake.received.some((entry) => entry.payload.type === "PONG")).toBe(
			true,
		);
		const silent = connection.request("nobody", "urn:x-cast:silent", {});
		connection.close();
		await expect(silent).rejects.toThrow("closed the connection");
		await expect(
			connection.request("receiver-0", castNamespaces.receiver, {}),
		).rejects.toThrow("closed the connection");
		expect(connection.closed).toBe(true);
	});

	test("rejects a refused request with the device's reason", async () => {
		const connection = new CastConnection(fake.socket);
		fake.receiver = { type: "LAUNCH_ERROR", reason: "NOT_FOUND" };
		await expect(
			connection.request("receiver-0", castNamespaces.receiver, {
				type: "LAUNCH",
			}),
		).rejects.toThrow("refused it (NOT_FOUND)");
		connection.close();
	});
});

function silentSocket(): Duplex {
	const written: Buffer[] = [];
	return new Duplex({
		read: () => {},
		write: (chunk: Buffer, _encoding, callback) => {
			written.push(chunk);
			callback();
		},
	});
}

describe("Cast connection timing and failures", () => {
	test("sends heartbeats, gives up on a silent device and on a late answer", async () => {
		jest.useFakeTimers();
		const connection = new CastConnection(fake.socket);
		const late = connection.request("nobody", "urn:x-cast:silent", {});
		jest.advanceTimersByTime(10_000);
		await expect(late).rejects.toThrow("didn't answer in time");
		expect(fake.received.some((entry) => entry.payload.type === "PING")).toBe(
			true,
		);
		connection.close();
		const silent = new CastConnection(silentSocket());
		jest.advanceTimersByTime(31_000);
		jest.advanceTimersByTime(5000);
		expect(silent.closed).toBe(true);
	});

	test("ignores broken payloads, closes on a broken frame or a socket error", async () => {
		const connection = new CastConnection(fake.socket);
		fake.socket.push(
			castProtocol.encode({
				sourceId: "receiver-0",
				destinationId: "sender-0",
				namespace: castNamespaces.receiver,
				payload: "not json",
			}),
		);
		fake.push(castNamespaces.connection, { type: "CLOSE" }, "transport-1");
		await Bun.sleep(10);
		expect(connection.closed).toBe(false);
		const header = Buffer.alloc(4);
		header.writeUInt32BE(1_000_000);
		fake.socket.push(header);
		await Bun.sleep(10);
		expect(connection.closed).toBe(true);
		connection.close();
		const other = new CastConnection(silentSocket());
		other.join("receiver-0");
		other.send("receiver-0", castNamespaces.receiver, {});
		other.close();
		other.send("receiver-0", castNamespaces.receiver, {});
		expect(other.closed).toBe(true);
	});

	test("opens a TLS channel, or says the device can't be reached", async () => {
		const sockets: Duplex[] = [];
		const client = new CastClient(() => {
			const socket = silentSocket();
			sockets.push(socket);
			return socket as unknown as TLSSocket;
		});
		const opened = client.open("192.0.2.40", 8009);
		sockets[0]?.emit("secureConnect");
		const connection = await opened;
		expect(connection.closed).toBe(false);
		connection.close();
		const refused = client.open("192.0.2.41", 8009);
		sockets[1]?.emit("error", new Error("ECONNREFUSED"));
		await expect(refused).rejects.toThrow("192.0.2.41 can't be reached");
		jest.useFakeTimers();
		const slow = client.open("192.0.2.42", 8009);
		jest.advanceTimersByTime(10_000);
		await expect(slow).rejects.toThrow("192.0.2.42 can't be reached");
	});
});

class FakeBrowser extends EventEmitter {
	queries = 0;
	destroyed = false;

	query(): void {
		this.queries += 1;
	}

	destroy(): void {
		this.destroyed = true;
	}
}

describe("Cast mDNS browse", () => {
	test("asks twice and returns the devices that answered", async () => {
		jest.useFakeTimers();
		const browser = new FakeBrowser();
		const browsing = new CastDiscovery(
			() => browser as unknown as MulticastDNS,
		).browse(4000);
		browser.emit("response", {
			answers: [{ type: "PTR", name: serviceName, data: instance }],
			additionals: [
				{
					type: "TXT",
					name: instance,
					data: ["id=0123", "fn=Kitchen speaker"],
				},
				{
					type: "SRV",
					name: instance,
					data: { port: 8009, target: "0123.local" },
				},
				{ type: "A", name: "0123.local", data: "192.0.2.40" },
				{ type: "OPT", name: "." },
			],
		});
		jest.advanceTimersByTime(4000);
		expect(await browsing).toMatchObject([
			{ externalId: "0123", name: "Kitchen speaker", host: "192.0.2.40" },
		]);
		expect(browser.queries).toBe(2);
		expect(browser.destroyed).toBe(true);
	});

	test("says why it can't listen", async () => {
		const browser = new FakeBrowser();
		const browsing = new CastDiscovery(
			() => browser as unknown as MulticastDNS,
		).browse(4000);
		browser.emit("error", new Error("EADDRINUSE"));
		await expect(browsing).rejects.toThrow(
			"can't listen for Cast devices: EADDRINUSE",
		);
		expect(browser.destroyed).toBe(true);
	});
});
