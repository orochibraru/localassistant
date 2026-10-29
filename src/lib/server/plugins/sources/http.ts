const requestTimeoutMs = 15_000;
const largestFileBytes = 64 * 1024 * 1024;

/** The HTTP calls every source shares: a timeout, plain-words failures and a size limit on downloads. */
class ForgeHttp {
	/**
	 * Fetches `url` with `headers`.
	 *
	 * @throws When `site` can't be reached.
	 */
	async get(
		url: string,
		headers: Record<string, string>,
		site: string,
	): Promise<Response> {
		try {
			return await fetch(url, {
				headers: { "User-Agent": "LocalAssistant", ...headers },
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
		} catch (error) {
			throw new Error(`${site} can't be reached from this server right now.`, {
				cause: error,
			});
		}
	}

	/**
	 * Throws a plain-words error for an answer that isn't usable, leaving 404 to the caller.
	 *
	 * @throws When `site` refused the token, limited this server or failed.
	 */
	check(response: Response, site: string, token: string | null): Response {
		if (response.status === 401 && token) {
			throw new Error(
				`${site} refused the saved token: it was revoked or expired. Save a new one in Admin, Integrations.`,
			);
		}
		if (
			response.status === 429 ||
			(response.status === 403 &&
				response.headers.get("x-ratelimit-remaining") === "0")
		) {
			throw new Error(
				`${site} is limiting requests from this server. Try again in an hour, or save a token for it.`,
			);
		}
		if (!response.ok && response.status !== 404 && response.status !== 422) {
			throw new Error(`${site} answered ${response.status}.`);
		}
		return response;
	}

	/**
	 * The body of a file download, or `null` when the file isn't there.
	 *
	 * @throws When the server failed or the file is over 64 MB.
	 */
	async bytes(response: Response, path: string): Promise<Uint8Array | null> {
		if (response.status === 404) {
			return null;
		}
		if (!response.ok) {
			throw new Error(`The server answered ${response.status} for ${path}.`);
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length > largestFileBytes) {
			throw new Error(`${path} is over 64 MB.`);
		}
		return bytes;
	}

	/**
	 * Checks `token` against a source's "who am I" endpoint.
	 *
	 * @throws When the site refuses it or can't be reached.
	 */
	async checkToken(
		url: string,
		headers: Record<string, string>,
		site: string,
	): Promise<void> {
		const response = await this.get(url, headers, site);
		if (response.status === 401 || response.status === 403) {
			throw new Error(
				`${site} refused that token. Check it wasn't revoked or expired, and may read repositories.`,
			);
		}
		if (!response.ok) {
			throw new Error(`${site} answered ${response.status}.`);
		}
	}

	/** The parts of a path inside a repository, without the manifest's name or steps outside it. */
	cleanPath(parts: string[]): string {
		return parts
			.filter((part) => part !== "localassistant-plugin.json")
			.filter((part) => part && part !== "." && part !== "..")
			.join("/");
	}

	/** `path` with each part URL-encoded and its slashes kept. */
	encodePath(path: string): string {
		return path.split("/").map(encodeURIComponent).join("/");
	}
}

export const forgeHttp = new ForgeHttp();
