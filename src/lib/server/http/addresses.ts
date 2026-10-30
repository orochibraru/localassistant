import dns from "node:dns/promises";
import { isIP } from "node:net";

import type { PluginField, PluginValues } from "#lib/plugins.js";

const lookupTimeoutMs = 5000;

/** Checks that the addresses typed into a form point somewhere the server can find. */
class Addresses {
	/** Whether the host of `url` is an IP address or a name the server's DNS resolves, internal names included. */
	async resolves(url: string): Promise<boolean> {
		const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
		if (isIP(host) !== 0) {
			return true;
		}
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timedOut = new Promise<false>((settle) => {
			timer = setTimeout(() => settle(false), lookupTimeoutMs);
		});
		try {
			return await Promise.race([
				dns.lookup(host).then(
					() => true,
					() => false,
				),
				timedOut,
			]);
		} finally {
			clearTimeout(timer);
		}
	}

	/**
	 * Checks every address field of `fields` filled in `values`.
	 *
	 * @throws When one names a host the server can't resolve, saying which.
	 */
	async check(fields: PluginField[], values: PluginValues): Promise<void> {
		for (const field of fields) {
			const value = values[field.name];
			if (field.type !== "url" || typeof value !== "string" || !value) {
				continue;
			}
			if (!(await this.resolves(value))) {
				throw new Error(
					`The server can't find ${new URL(value).hostname}. Check ${field.label.toLowerCase()}, or the server's DNS.`,
				);
			}
		}
	}
}

export const addresses = new Addresses();
