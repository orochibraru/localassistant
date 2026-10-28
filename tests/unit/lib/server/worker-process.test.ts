import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkerSupervisor } from "#lib/server/worker/supervisor.js";

describe("worker process", () => {
	test("workerCommand runs the source in dev and the binary otherwise", () => {
		expect(WorkerSupervisor.command(true)).toEqual([
			process.execPath,
			"--watch",
			"src/worker/index.ts",
		]);
		expect(WorkerSupervisor.command(false)[0]?.endsWith("/worker")).toBe(true);
	});

	test("nextRestartDelay backs off and resets after a stable run", () => {
		expect(WorkerSupervisor.nextRestartDelay(500, 10)).toBe(1000);
		expect(WorkerSupervisor.nextRestartDelay(20_000, 10)).toBe(30_000);
		expect(WorkerSupervisor.nextRestartDelay(30_000, 120_000)).toBe(1000);
	});

	test("restarts the worker when it exits, and stops for good on stop()", async () => {
		const exits: ((code: number | null) => void)[] = [];
		let kills = 0;
		const supervisor = new WorkerSupervisor(["worker"], (_command, onExit) => {
			exits.push(onExit);
			return { kill: () => (kills += 1) };
		});
		supervisor.start();
		exits[0]?.(1);
		await Bun.sleep(1100);
		expect(exits).toHaveLength(2);
		supervisor.stop();
		exits[1]?.(0);
		expect(kills).toBe(1);
	});

	test("a spawn that throws is retried", async () => {
		let attempts = 0;
		const supervisor = new WorkerSupervisor(["missing"], () => {
			attempts += 1;
			throw new Error("not found");
		});
		supervisor.start();
		await Bun.sleep(1100);
		supervisor.stop();
		expect(attempts).toBe(2);
	});

	test("the real worker receives the server's configuration over IPC", async () => {
		const output = join(tmpdir(), `localassistant-ipc-${crypto.randomUUID()}`);
		const supervisor = new WorkerSupervisor([
			process.execPath,
			"tests/unit/fixtures/ipc-worker.ts",
			output,
		]);
		supervisor.start();
		for (
			let attempt = 0;
			attempt < 50 && !(await Bun.file(output).exists());
			attempt += 1
		) {
			await Bun.sleep(100);
		}
		supervisor.stop();
		expect(await Bun.file(output).text()).toBe("0.0.0-test");
	});
});
