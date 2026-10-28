import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");

export interface RunningApp {
	origin: string;
	databasePath: string;
	setupCode: () => Promise<string>;
	stop: () => Promise<void>;
}

/**
 * Boots the compiled server (`bun run build` first) on `port` against a fresh SQLite file under `tmp/`, waits until
 * it answers, and collects its log so tests can read the setup code it prints.
 *
 * @throws When there is no build or the server doesn't come up within 30 seconds.
 */
export async function startApp(port: number): Promise<RunningApp> {
	const binary = join(root, "build", "server");
	if (!existsSync(binary)) {
		throw new Error("No build/server: run `bun run build` first");
	}
	const directory = join(root, "tmp", `app-${port}`);
	await rm(directory, { recursive: true, force: true });
	await mkdir(directory, { recursive: true });
	const origin = `http://localhost:${port}`;
	const server = Bun.spawn(
		[
			"env",
			`PORT=${port}`,
			`ORIGIN=${origin}`,
			`AUTH_SECRET=${crypto.randomUUID()}${crypto.randomUUID()}`,
			`DATABASE_PATH=${join(directory, "localassistant.sqlite")}`,
			"LOG_FORMAT=json",
			"LOG_LEVEL=info",
			binary,
		],
		{
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		},
	);

	let log = "";
	const decoder = new TextDecoder();
	const collect = async (stream: ReadableStream<Uint8Array>) => {
		for await (const chunk of stream) {
			log += decoder.decode(chunk);
		}
	};
	void collect(server.stdout);
	void collect(server.stderr);

	const deadline = Date.now() + 30_000;
	for (;;) {
		const response = await fetch(`${origin}/api/health`).catch(() => null);
		if (response?.ok) {
			break;
		}
		if (Date.now() > deadline || server.exitCode !== null) {
			server.kill();
			throw new Error(`The server didn't come up:\n${log.slice(-2000)}`);
		}
		await Bun.sleep(200);
	}

	return {
		origin,
		databasePath: join(directory, "localassistant.sqlite"),
		setupCode: async () => {
			for (let attempt = 0; attempt < 50; attempt += 1) {
				const codes = [...log.matchAll(/Setup code: (\d{3}) (\d{3})/g)];
				const last = codes.at(-1);
				if (last) {
					return `${last[1]}${last[2]}`;
				}
				await Bun.sleep(100);
			}
			throw new Error("The server never printed a setup code");
		},
		stop: async () => {
			server.kill();
			await server.exited;
			await rm(directory, { recursive: true, force: true });
		},
	};
}
