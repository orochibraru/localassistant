export interface ActionResult {
	type: "success" | "failure" | "redirect" | "error";
	status: number;
	location?: string;
	data?: string;
}

/** A browser stand-in: keeps the cookies the server sets and sends the origin a browser would. */
export class Client {
	readonly #origin: string;
	readonly #cookies = new Map<string, string>();

	/** A client with no cookies, talking to `origin`. */
	constructor(origin: string) {
		this.#origin = origin;
	}

	/** Whether the server set a cookie called `name`. */
	hasCookie(name: string): boolean {
		return this.#cookies.has(name);
	}

	/** GETs `path` without following redirects. */
	async get(path: string): Promise<Response> {
		return this.#send(path, { method: "GET" });
	}

	/** Posts `fields` to the form action `action` of the page at `path`, as `use:enhance` does. */
	async action(
		path: string,
		action: string,
		fields: Record<string, string | string[]>,
		origin = this.#origin,
	): Promise<ActionResult> {
		const body = new URLSearchParams();
		for (const [name, value] of Object.entries(fields)) {
			for (const entry of Array.isArray(value) ? value : [value]) {
				body.append(name, entry);
			}
		}
		const response = await this.#send(`${path}?/${action}`, {
			method: "POST",
			body,
			headers: {
				accept: "application/json",
				origin,
				"x-sveltekit-action": "true",
			},
		});
		const result = response.headers.get("content-type")?.includes("json")
			? ((await response.json()) as Partial<ActionResult>)
			: {};
		return result.type
			? (result as ActionResult)
			: { type: "error", status: response.status };
	}

	async #send(path: string, init: RequestInit): Promise<Response> {
		const headers = new Headers(init.headers);
		if (this.#cookies.size > 0) {
			headers.set(
				"cookie",
				[...this.#cookies]
					.map(([name, value]) => `${name}=${value}`)
					.join("; "),
			);
		}
		const response = await fetch(`${this.#origin}${path}`, {
			...init,
			headers,
			redirect: "manual",
		});
		for (const cookie of response.headers.getSetCookie()) {
			const [pair = ""] = cookie.split(";");
			const separator = pair.indexOf("=");
			const name = pair.slice(0, separator);
			const value = pair.slice(separator + 1);
			if (value === "" || /max-age=0/i.test(cookie)) {
				this.#cookies.delete(name);
			} else {
				this.#cookies.set(name, value);
			}
		}
		return response;
	}
}
