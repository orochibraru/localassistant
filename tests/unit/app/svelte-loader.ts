import { mock } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { plugin } from "bun";
import { compile, compileModule } from "svelte/compiler";

import { configuration } from "../../../src/lib/server/core/config.ts";

const require = createRequire(import.meta.url);
const typescript = new Bun.Transpiler({ loader: "ts" });
const svelteClientEntry = join(
	dirname(require.resolve("svelte/package.json")),
	"src/index-client.js",
);
mock.module("svelte", async () => await import(svelteClientEntry));
mock.module("$app/paths", () => ({
	asset: (path: string) => `/${path}`,
	base: "",
	resolve: (path: string) =>
		(path.startsWith("/") ? path : `/${path}`).replaceAll(/\/\([^)]+\)/g, "") ||
		"/",
}));

configuration.set({
	appVersion: "0.0.0-test",
	origin: undefined,
	databasePath: ":memory:",
	signInMethods: undefined,
	logLevel: "error",
	logFormat: "console",
	auth: { secret: "test-secret-that-is-long-enough-for-tests" },
	worker: { concurrency: 1, pollIntervalMs: 1000 },
});

mock.module("$app/env", () => ({
	browser: false,
	building: false,
	dev: false,
	version: "test",
}));

mock.module("$app/server", () => ({ getRequestEvent: () => undefined }));

function bareFilePath(path: string): string {
	return path.slice(0, path.includes("?") ? path.indexOf("?") : path.length);
}

plugin({
	name: "svelte loader",
	setup(builder) {
		builder.onLoad(
			{ filter: /(?<!\.svelte\.(js|ts))\.svelte(\?[^.]+)?$/ },
			({ path }) => {
				try {
					const source = readFileSync(bareFilePath(path), "utf-8");
					const result = compile(source, {
						dev: false,
						filename: path,
						generate: "client",
					});
					return { contents: result.js.code, loader: "js" };
				} catch (err) {
					if (err instanceof Error) {
						throw new Error(
							`Failed to compile Svelte component: ${err.message}`,
						);
					}
					throw new Error(`Failed to compile Svelte component: ${String(err)}`);
				}
			},
		);
		builder.onLoad({ filter: /\.svelte\.(js|ts)(\?[^.]+)?$/ }, ({ path }) => {
			try {
				const source = readFileSync(bareFilePath(path), "utf-8");
				const script = path.includes(".svelte.ts")
					? typescript.transformSync(source)
					: source;
				const result = compileModule(script, { filename: path });
				return { contents: result.js.code, loader: "js" };
			} catch (err) {
				if (err instanceof Error) {
					throw new Error(`Failed to compile Svelte module: ${err.message}`);
				}
				throw new Error(`Failed to compile Svelte module: ${String(err)}`);
			}
		});
	},
});
