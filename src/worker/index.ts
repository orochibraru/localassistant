import { type Config, configuration } from "#lib/server/core/config.js";
import { Logger } from "#lib/server/core/logger.js";
import {
	workerMessages,
	type WorkerReadyMessage,
} from "#lib/server/worker/messages.js";

import { isProcessAlive } from "./watchdog.js";

const logger = new Logger("Worker");

const parentPid = process.ppid;
const configTimeoutMs = 10_000;

setInterval(() => {
	if (!isProcessAlive(parentPid)) {
		logger.warn("Parent server is gone, exiting");
		process.exit(0);
	}
}, 1000).unref();

function receiveConfig(): Promise<Config> {
	return new Promise((resolve, reject) => {
		if (!process.send) {
			reject(
				new Error(
					"The worker only runs under the server, which hands it its configuration",
				),
			);
			return;
		}
		const timeout = setTimeout(
			() => reject(new Error("The server sent no configuration")),
			configTimeoutMs,
		);
		process.on("message", (message) => {
			if (workerMessages.isConfig(message)) {
				clearTimeout(timeout);
				resolve(message.config);
			}
		});
		process.send({ type: "ready" } satisfies WorkerReadyMessage);
	});
}

try {
	configuration.set(await receiveConfig());
	await import("./main.js");
	process.exit(0);
} catch (error) {
	logger.error("Worker failed to start", error);
	process.exit(1);
}
