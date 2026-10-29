import type { DeviceDTO } from "#lib/dto/device.js";
import { secrets } from "#lib/server/core/secrets.js";

const port = 6000;
const timeoutMs = 10_000;
const headerBytes = 16;

/**
 * The camera of a Bambu Lab P1 or A1: JPEG frames over TLS on port 6000, after an 80-byte login with the access code.
 * Each call opens a connection, takes one frame and closes it.
 */
class BambuCamera {
	/** The 80-byte login packet for `accessCode`. */
	login(accessCode: string): Buffer {
		const packet = Buffer.alloc(80);
		packet.writeUInt32LE(0x40, 0);
		packet.writeUInt32LE(0x3000, 4);
		packet.write("bblp", 16, 32, "ascii");
		packet.write(accessCode, 48, 32, "ascii");
		return packet;
	}

	/** The JPEG in `received` once a whole frame arrived, or `null` while it's still coming. */
	frame(received: Buffer): Buffer | null {
		if (received.length < headerBytes) {
			return null;
		}
		const size = received.readUInt32LE(0);
		if (received.length < headerBytes + size) {
			return null;
		}
		const jpeg = received.subarray(headerBytes, headerBytes + size);
		return jpeg[0] === 0xff && jpeg[1] === 0xd8 ? jpeg : null;
	}

	/**
	 * One picture from the printer's camera.
	 *
	 * @throws When the printer can't be reached, refuses the access code or sends no picture in time.
	 */
	async snapshot(device: DeviceDTO): Promise<Buffer> {
		const encrypted = device.encryptedLocalKey();
		if (device.kind !== "bambu-printer" || !device.host || !encrypted) {
			throw new Error("That device is not a printer with an access code.");
		}
		const accessCode = secrets.decrypt(encrypted);
		const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
		let received = Buffer.alloc(0);
		const timer = setTimeout(
			() =>
				reject(
					new Error(
						"The printer sent no picture. Turn on LAN mode liveview in its settings.",
					),
				),
			timeoutMs,
		);
		const socket = await Bun.connect({
			hostname: device.host,
			port,
			tls: { rejectUnauthorized: false },
			socket: {
				open: (opened) => {
					opened.write(this.login(accessCode));
				},
				data: (_socket, chunk) => {
					received = Buffer.concat([received, chunk]);
					const jpeg = this.frame(received);
					if (jpeg) {
						resolve(Buffer.from(jpeg));
					}
				},
				close: () =>
					reject(new Error("The printer closed the camera connection.")),
				error: (_socket, failure) => reject(failure),
			},
		}).catch((failure: unknown) => {
			clearTimeout(timer);
			throw new Error("The printer's camera can't be reached.", {
				cause: failure,
			});
		});
		try {
			return await promise;
		} finally {
			clearTimeout(timer);
			socket.end();
		}
	}
}

export const bambuCamera = new BambuCamera();
