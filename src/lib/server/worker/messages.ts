import type { Config } from "#lib/server/core/config.js";

export interface WorkerReadyMessage {
	type: "ready";
}

export interface WorkerConfigMessage {
	type: "config";
	config: Config;
}

/** Recognises the IPC messages the server and its worker exchange at start-up. */
class WorkerMessages {
	/** Whether an IPC message is the worker asking for its configuration. */
	isReady(message: unknown): message is WorkerReadyMessage {
		return (
			typeof message === "object" &&
			message !== null &&
			(message as { type?: unknown }).type === "ready"
		);
	}

	/** Whether an IPC message is the server sending the worker its configuration. */
	isConfig(message: unknown): message is WorkerConfigMessage {
		return (
			typeof message === "object" &&
			message !== null &&
			(message as { type?: unknown }).type === "config" &&
			typeof (message as { config?: unknown }).config === "object"
		);
	}
}

export const workerMessages = new WorkerMessages();
