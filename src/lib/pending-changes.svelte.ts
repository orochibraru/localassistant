export interface PendingChangesOptions<Change extends object> {
	send: (change: Partial<Change>) => Promise<void>;
	describe: (error: unknown) => string;
	delayMs?: number;
}

/**
 * Optimistic device control: changes show at once, are merged while the person keeps tapping, and go out as one command
 * once they stop. A change that fails is dropped so the card falls back to what the device last reported, and `error`
 * says why until the next change.
 */
export class PendingChanges<Change extends object> {
	values = $state<Partial<Change>>({});
	sending = $state(false);
	error = $state<string | null>(null);

	readonly #options: PendingChangesOptions<Change>;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#again = false;

	constructor(options: PendingChangesOptions<Change>) {
		this.#options = options;
	}

	/** Shows `change` right away and (re)starts the wait before it is sent. */
	set(change: Partial<Change>): void {
		this.values = { ...this.values, ...change };
		this.error = null;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(
			() => void this.flush(),
			this.#options.delayMs ?? 700,
		);
	}

	/** Sends what's pending now; while a command is in flight, sends again once it settles. */
	async flush(): Promise<void> {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		if (this.sending) {
			this.#again = true;
			return;
		}
		const batch = { ...this.values };
		if (Object.keys(batch).length === 0) {
			return;
		}
		this.sending = true;
		try {
			await this.#options.send(batch);
		} catch (error) {
			this.error = this.#options.describe(error);
		} finally {
			this.#settle(batch);
		}
	}

	/** Stops a pending send, for when the card goes away. */
	cancel(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}

	#settle(batch: Partial<Change>): void {
		const remaining = { ...this.values };
		for (const key of Object.keys(batch) as (keyof Change)[]) {
			if (remaining[key] === batch[key]) {
				delete remaining[key];
			}
		}
		this.values = remaining;
		this.sending = false;
		if (this.#again) {
			this.#again = false;
			void this.flush();
		}
	}
}
