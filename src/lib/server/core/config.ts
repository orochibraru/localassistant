export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";
export type LogFormat = "console" | "json";
export type SignInMethodName =
	"password" | "passkey" | "magic-link" | "email-code";

export interface Config {
	appVersion: string;
	origin: string | undefined;
	databasePath: string;
	signInMethods: SignInMethodName[] | undefined;
	logLevel: LogLevel;
	logFormat: LogFormat;
	auth: { secret: string };
	worker: { concurrency: number; pollIntervalMs: number };
}

const globalForConfig = globalThis as unknown as {
	__localassistantConfig?: Config;
};

/** Holds the process-wide configuration, kept on `globalThis` so Vite HMR reloads share it. */
class Configuration {
	/** Sets the configuration every server module reads: from `$app/env/private` in the server, from the server in the worker. */
	set(values: Config): void {
		globalForConfig.__localassistantConfig = values;
	}

	/**
	 * The configuration.
	 *
	 * @throws When read before `set()`.
	 */
	get(): Config {
		if (!globalForConfig.__localassistantConfig) {
			throw new Error("Configuration read before configuration.set() ran");
		}
		return globalForConfig.__localassistantConfig;
	}

	/** The configuration, or `undefined` before `set()`: for the logger, which may run first. */
	peek(): Config | undefined {
		return globalForConfig.__localassistantConfig;
	}
}

export const configuration = new Configuration();
