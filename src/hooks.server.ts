import { building, dev } from "$app/env";
import {
	type Handle,
	type HandleServerError,
	sequence,
	type ServerInit,
} from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";

import { authService } from "#lib/server/auth/auth.js";
import { securityPolicy } from "#lib/server/auth/security-policy.js";
import { instanceSetup } from "#lib/server/auth/setup.js";
import { Logger } from "#lib/server/core/logger.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { csrfHandler } from "#lib/server/http/csrf.js";
import { securityHeaders } from "#lib/server/http/security-headers.js";
import { WorkerSupervisor } from "#lib/server/worker/supervisor.js";

const logger = new Logger("Server");

const globalForWorker = globalThis as unknown as {
	__localassistantWorker?: WorkerSupervisor;
};

const devShutdownSignals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

function shutDown(reason: string): void {
	logger.info("Shutting down", { reason });
	globalForWorker.__localassistantWorker?.stop();
	databaseConnection.close();
	process.exit(0);
}

export const init: ServerInit = () => {
	try {
		databaseConnection.migrate();
	} catch (error) {
		logger.error("Could not migrate the database, refusing to start", error);
		throw error;
	}
	logger.info("Database migrated");

	if (globalForWorker.__localassistantWorker) {
		return;
	}
	instanceSetup.announce();
	const supervisor = new WorkerSupervisor(WorkerSupervisor.command(dev));
	supervisor.start();
	globalForWorker.__localassistantWorker = supervisor;

	process.once("exit", () => supervisor.stop());
	process.once("sveltekit:shutdown", () => shutDown("sveltekit:shutdown"));
	if (dev) {
		for (const signal of devShutdownSignals) {
			process.once(signal, () => shutDown(signal));
		}
	}
};

const quietPaths = [
	"/_app/",
	"/.well-known/",
	"/api/health",
	"/favicon",
	"/sw.js",
	"/workbox-",
];

const requestLog: Handle = async ({ event, resolve }) => {
	const startedAt = performance.now();
	const response = await resolve(event);
	if (
		!event.url.pathname.endsWith("/__data.json") &&
		!quietPaths.some((path) => event.url.pathname.startsWith(path))
	) {
		logger.request({
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			durationMs: Math.round(performance.now() - startedAt),
		});
	}
	return response;
};

const authentication: Handle = async ({ event, resolve }) => {
	const auth = authService.get();
	const current = await auth.api.getSession({ headers: event.request.headers });
	const gate = current
		? securityPolicy.sessionGate(current, event.route.id)
		: undefined;
	event.locals.gate = gate ?? null;
	event.locals.session = gate ? null : (current?.session ?? null);
	event.locals.user = gate ? null : (current?.user ?? null);
	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle = sequence(
	requestLog,
	securityHeaders,
	csrfHandler(() => authService.publicOrigin()),
	authentication,
);

export const handleError: HandleServerError = ({ error, event, kind }) => {
	if (kind !== "unknown") {
		return;
	}
	const errorId = crypto.randomUUID();
	logger.error(
		"Unhandled error",
		{ errorId, method: event.request.method, path: event.url.pathname },
		error,
	);
	return { errorId, message: "Something went wrong." };
};
