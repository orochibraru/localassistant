import multicastDns, { type MulticastDNS } from "multicast-dns";

import type { FoundDevice } from "#lib/plugin-sdk.js";

import { castMapping, type CastRecord, serviceName } from "./mapping.js";

const askAgainAfterMs = 1000;

/** Browses the network for Cast devices over mDNS. */
export class CastDiscovery {
	readonly #createBrowser: () => MulticastDNS;

	/** Browses with the mDNS browsers `createBrowser` makes, multicast-dns's by default. */
	constructor(createBrowser: () => MulticastDNS = multicastDns) {
		this.#createBrowser = createBrowser;
	}

	/**
	 * Asks the network for `_googlecast._tcp` for `durationMs` and returns the devices that answered.
	 *
	 * @throws When this server can't listen for mDNS, saying why.
	 */
	browse(durationMs: number): Promise<FoundDevice[]> {
		const { promise, resolve, reject } = Promise.withResolvers<FoundDevice[]>();
		const records: CastRecord[] = [];
		const browser = this.#createBrowser();
		const ask = () =>
			browser.query({ questions: [{ name: serviceName, type: "PTR" }] });
		const again = setTimeout(ask, askAgainAfterMs);
		const done = setTimeout(() => {
			clearTimeout(again);
			browser.destroy();
			resolve(castMapping.found(records));
		}, durationMs);
		browser.on("response", (response) => {
			for (const record of [...response.answers, ...response.additionals]) {
				records.push({
					type: record.type,
					name: record.name,
					data: "data" in record ? record.data : null,
				});
			}
		});
		browser.on("error", (error) => {
			clearTimeout(again);
			clearTimeout(done);
			browser.destroy();
			reject(
				new Error(
					`This server can't listen for Cast devices: ${error.message}`,
					{
						cause: error,
					},
				),
			);
		});
		ask();
		return promise;
	}
}

export const castDiscovery = new CastDiscovery();
