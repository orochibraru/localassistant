import {
	APP_VERSION,
	AUTH_SECRET,
	DATABASE_PATH,
	LOG_FORMAT,
	LOG_LEVEL,
	ORIGIN,
	SIGN_IN_METHODS,
	WORKER_CONCURRENCY,
	WORKER_POLL_INTERVAL_MS,
} from "$app/env/private";

import type { Config } from "#lib/server/core/config.js";

import packageJson from "../../../../package.json" with { type: "json" };

/** Builds the server's configuration from the environment. */
class EnvironmentConfig {
	/** The configuration built from the validated variables `src/env.ts` declares. */
	build(): Config {
		const appVersion = APP_VERSION ?? packageJson.version;
		return {
			appVersion,
			origin: ORIGIN ? new URL(ORIGIN).origin : undefined,
			databasePath: DATABASE_PATH,
			signInMethods: SIGN_IN_METHODS,
			logLevel: LOG_LEVEL,
			logFormat: LOG_FORMAT,
			auth: { secret: AUTH_SECRET },
			worker: {
				concurrency: WORKER_CONCURRENCY,
				pollIntervalMs: WORKER_POLL_INTERVAL_MS,
			},
		};
	}
}

export const environmentConfig = new EnvironmentConfig();
