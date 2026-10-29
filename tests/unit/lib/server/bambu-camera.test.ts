import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { secrets } from "#lib/server/core/secrets.js";
import { bambuCamera } from "#lib/server/devices/bambu-camera.js";

import { homeId, resetDatabase } from "../../database.js";

const jpeg = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);

function framed(payload: Buffer): Buffer {
	const header = Buffer.alloc(16);
	header.writeUInt32LE(payload.length, 0);
	return Buffer.concat([header, payload]);
}

function printer(withCode = true) {
	return DeviceDTO.upsert({
		kind: "bambu-printer",
		homeId: homeId(),
		name: "P1S",
		externalId: "01P00A000000000",
		host: "192.0.2.50",
		encryptedLocalKey: withCode ? secrets.encrypt("12345678") : undefined,
	});
}

interface Handlers {
	open: (socket: { write: (data: Buffer) => void }) => void;
	data: (socket: unknown, chunk: Buffer) => void;
	close: () => void;
	error: (socket: unknown, failure: Error) => void;
}

describe("Bambu camera", () => {
	beforeEach(resetDatabase);

	test("logs in with the access code and reads one frame, even split in chunks", async () => {
		const login = bambuCamera.login("12345678");
		expect(login.length).toBe(80);
		expect(login.readUInt32LE(0)).toBe(0x40);
		expect(login.subarray(16, 20).toString()).toBe("bblp");
		expect(login.subarray(48, 56).toString()).toBe("12345678");
		expect(bambuCamera.frame(Buffer.alloc(4))).toBeNull();
		expect(bambuCamera.frame(framed(Buffer.from("not a jpeg")))).toBeNull();

		const written: Buffer[] = [];
		let ended = false;
		const connect = spyOn(Bun, "connect").mockImplementation((async (options: {
			socket: Handlers;
		}) => {
			queueMicrotask(() => {
				options.socket.open({ write: (data) => written.push(data) });
				const frame = framed(jpeg);
				options.socket.data(null, frame.subarray(0, 10));
				options.socket.data(null, frame.subarray(10));
			});
			return { end: () => (ended = true) };
		}) as unknown as typeof Bun.connect);
		expect([...(await bambuCamera.snapshot(printer()))]).toEqual([...jpeg]);
		expect(written[0]?.length).toBe(80);
		expect(ended).toBe(true);

		connect.mockImplementation((async (options: { socket: Handlers }) => {
			queueMicrotask(() => options.socket.close());
			return { end: () => undefined };
		}) as unknown as typeof Bun.connect);
		expect(bambuCamera.snapshot(printer())).rejects.toThrow(
			"closed the camera connection",
		);
		connect.mockImplementation((async (options: { socket: Handlers }) => {
			queueMicrotask(() =>
				options.socket.error(null, new Error("bad certificate")),
			);
			return { end: () => undefined };
		}) as unknown as typeof Bun.connect);
		expect(bambuCamera.snapshot(printer())).rejects.toThrow("bad certificate");
		connect.mockRejectedValue(new Error("ECONNREFUSED"));
		expect(bambuCamera.snapshot(printer())).rejects.toThrow("can't be reached");
		connect.mockRestore();
		resetDatabase();
		expect(bambuCamera.snapshot(printer(false))).rejects.toThrow("access code");
	});
});
