import { describe, expect, test } from "bun:test";

import { PendingChanges } from "#lib/pending-changes.svelte.js";

interface Change {
	power: boolean;
	targetTemperature: number;
}

function control(send: (change: Partial<Change>) => Promise<void>) {
	return new PendingChanges<Change>({
		delayMs: 5,
		send,
		describe: (error) => (error instanceof Error ? error.message : "failed"),
	});
}

describe("PendingChanges", () => {
	test("shows changes at once and sends the taps as one command", async () => {
		const sent: Partial<Change>[] = [];
		const pending = control((change) => {
			sent.push(change);
			return Promise.resolve();
		});
		pending.set({ targetTemperature: 20.5 });
		pending.set({ targetTemperature: 21 });
		pending.set({ power: true });
		expect(pending.values).toEqual({ targetTemperature: 21, power: true });
		expect(sent).toEqual([]);
		await Bun.sleep(20);
		expect(sent).toEqual([{ targetTemperature: 21, power: true }]);
		expect(pending.values).toEqual({});
		expect(pending.sending).toBe(false);
	});

	test("a failed command is dropped and says why until the next change", async () => {
		const pending = control(() => Promise.reject(new Error("unreachable")));
		pending.set({ power: false });
		await pending.flush();
		expect(pending.values).toEqual({});
		expect(pending.error).toBe("unreachable");
		pending.set({ power: true });
		expect(pending.error).toBeNull();
		pending.cancel();
		await Bun.sleep(20);
		expect(pending.values).toEqual({ power: true });
	});

	test("a change made while one is in flight goes out after it, and keeps showing", async () => {
		const sent: Partial<Change>[] = [];
		let release = () => {};
		const pending = control((change) => {
			sent.push(change);
			return sent.length === 1
				? new Promise<void>((resolve) => {
						release = resolve;
					})
				: Promise.resolve();
		});
		pending.set({ targetTemperature: 20 });
		const first = pending.flush();
		expect(pending.sending).toBe(true);
		pending.set({ targetTemperature: 22 });
		await pending.flush();
		expect(pending.values).toEqual({ targetTemperature: 22 });
		expect(sent).toHaveLength(1);
		release();
		await first;
		await Bun.sleep(20);
		expect(sent).toEqual([
			{ targetTemperature: 20 },
			{ targetTemperature: 22 },
		]);
		expect(pending.values).toEqual({});
		await pending.flush();
		expect(sent).toHaveLength(2);
	});
});
