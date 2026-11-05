export interface CastMessage {
	sourceId: string;
	destinationId: string;
	namespace: string;
	payload: string;
}

export interface CastFrames {
	bodies: Buffer[];
	rest: Buffer;
}

const lengthBytes = 4;
const largestFrame = 64 * 1024;

const fieldNumbers = {
	protocolVersion: 1,
	sourceId: 2,
	destinationId: 3,
	namespace: 4,
	payloadType: 5,
	payloadUtf8: 6,
} as const;

const wireTypes = { varint: 0, fixed64: 1, lengthDelimited: 2, fixed32: 5 };

/**
 * The Cast v2 wire format: a `CastMessage` protocol buffer with a UTF-8 JSON payload, each framed by its length as a
 * 32-bit big-endian number.
 */
class CastProtocol {
	/** The framed bytes of `message`, ready to write to the socket. */
	encode(message: CastMessage): Buffer {
		const body = Buffer.concat([
			this.#varintField(fieldNumbers.protocolVersion, 0),
			this.#textField(fieldNumbers.sourceId, message.sourceId),
			this.#textField(fieldNumbers.destinationId, message.destinationId),
			this.#textField(fieldNumbers.namespace, message.namespace),
			this.#varintField(fieldNumbers.payloadType, 0),
			this.#textField(fieldNumbers.payloadUtf8, message.payload),
		]);
		const length = Buffer.alloc(lengthBytes);
		length.writeUInt32BE(body.length);
		return Buffer.concat([length, body]);
	}

	/** The message in one frame's body, or null when it isn't a text message; unknown fields are skipped. */
	decode(body: Buffer): CastMessage | null {
		const texts = new Map<number, string>();
		let offset = 0;
		while (offset < body.length) {
			const tag = this.#readVarint(body, offset);
			if (!tag) {
				return null;
			}
			offset = tag.next;
			const field = Math.floor(tag.value / 8);
			const wireType = tag.value % 8;
			if (wireType === wireTypes.varint) {
				const value = this.#readVarint(body, offset);
				if (!value) {
					return null;
				}
				offset = value.next;
			} else if (wireType === wireTypes.lengthDelimited) {
				const length = this.#readVarint(body, offset);
				if (!length || length.next + length.value > body.length) {
					return null;
				}
				texts.set(
					field,
					body.toString("utf8", length.next, length.next + length.value),
				);
				offset = length.next + length.value;
			} else if (wireType === wireTypes.fixed64) {
				offset += 8;
			} else if (wireType === wireTypes.fixed32) {
				offset += 4;
			} else {
				return null;
			}
		}
		const payload = texts.get(fieldNumbers.payloadUtf8);
		const namespace = texts.get(fieldNumbers.namespace);
		if (payload === undefined || namespace === undefined) {
			return null;
		}
		return {
			sourceId: texts.get(fieldNumbers.sourceId) ?? "",
			destinationId: texts.get(fieldNumbers.destinationId) ?? "",
			namespace,
			payload,
		};
	}

	/**
	 * Splits what arrived on the socket into whole frame bodies and the bytes of a frame still coming.
	 *
	 * @throws When a frame claims more than 64 KiB, which no Cast device sends.
	 */
	split(buffer: Buffer): CastFrames {
		const bodies: Buffer[] = [];
		let offset = 0;
		while (buffer.length - offset >= lengthBytes) {
			const length = buffer.readUInt32BE(offset);
			if (length > largestFrame) {
				throw new Error("The Cast device sent a frame too large to be one.");
			}
			if (buffer.length - offset - lengthBytes < length) {
				break;
			}
			bodies.push(
				buffer.subarray(offset + lengthBytes, offset + lengthBytes + length),
			);
			offset += lengthBytes + length;
		}
		return { bodies, rest: buffer.subarray(offset) };
	}

	#varintField(field: number, value: number): Buffer {
		return Buffer.concat([
			this.#varint(field * 8 + wireTypes.varint),
			this.#varint(value),
		]);
	}

	#textField(field: number, text: string): Buffer {
		const bytes = Buffer.from(text, "utf8");
		return Buffer.concat([
			this.#varint(field * 8 + wireTypes.lengthDelimited),
			this.#varint(bytes.length),
			bytes,
		]);
	}

	#varint(value: number): Buffer {
		const bytes: number[] = [];
		let rest = value;
		while (rest >= 0x80) {
			bytes.push((rest % 0x80) + 0x80);
			rest = Math.floor(rest / 0x80);
		}
		bytes.push(rest);
		return Buffer.from(bytes);
	}

	#readVarint(
		buffer: Buffer,
		start: number,
	): { value: number; next: number } | null {
		let value = 0;
		let scale = 1;
		for (let offset = start; offset < buffer.length && offset - start < 8;) {
			const byte = buffer[offset] ?? 0;
			value += (byte % 0x80) * scale;
			offset += 1;
			if (byte < 0x80) {
				return { value, next: offset };
			}
			scale *= 0x80;
		}
		return null;
	}
}

export const castProtocol = new CastProtocol();
