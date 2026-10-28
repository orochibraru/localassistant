import { mkdir } from "node:fs/promises";

import { e2ePort } from "../../playwright.config.js";
import { startApp } from "../support/app.js";

/** Boots the built app on a fresh database for the whole run and shares its setup code with the specs. */
export default async function globalSetup(): Promise<() => Promise<void>> {
	const app = await startApp(e2ePort);
	await mkdir("tmp/e2e", { recursive: true });
	await Bun.write("tmp/e2e/setup-code.txt", await app.setupCode());
	return app.stop;
}
