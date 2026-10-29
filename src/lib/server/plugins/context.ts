import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { HomeDTO } from "#lib/dto/home.js";
import { JobDTO } from "#lib/dto/job.js";
import { getPluginSettings, getSetting } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import type {
	FoundDevice,
	PluginContext,
	PluginDevice,
	PluginLogger,
} from "#lib/plugin-sdk.js";
import type { PluginManifest, PluginValues } from "#lib/plugins.js";
import { configuration } from "#lib/server/core/config.js";
import { Logger } from "#lib/server/core/logger.js";
import { secrets } from "#lib/server/core/secrets.js";
import { broker } from "#lib/server/devices/broker.js";
import { deviceEvents } from "#lib/server/devices/device-events.js";
import { fileResponse } from "#lib/server/http/file-response.js";

export interface HostedContext extends PluginContext {
	dispose(): void;
}

/** Builds the context each plugin gets: its devices, settings, logger, the shared broker and timers it can't leak. */
class PluginContexts {
	/** A device as a plugin sees it: its fields, and its secrets decrypted on demand. */
	device(device: DeviceDTO): PluginDevice {
		const row = device.toJSON();
		return {
			id: row.id,
			kind: row.kind,
			name: row.name,
			externalId: row.externalId,
			host: row.host,
			homeId: row.homeId,
			roomId: row.roomId,
			fields: row.fields,
			state: row.state,
			stateAt: row.stateAt,
			secret: (name) => {
				const encrypted = device.encryptedSecrets()[name];
				return encrypted ? secrets.decrypt(encrypted) : null;
			},
		};
	}

	/** What `pluginId` is connected with, its secrets decrypted, or `null` when it isn't connected. */
	settings(pluginId: string): PluginValues | null {
		const stored = getPluginSettings(pluginId);
		if (!stored) {
			return null;
		}
		const decrypted = Object.fromEntries(
			Object.entries(stored.secrets).map(([name, value]) => [
				name,
				secrets.decrypt(value),
			]),
		);
		return { ...stored.values, ...decrypted };
	}

	/** The context for the plugin described by `manifest`; `dispose()` stops its timers and subscriptions. */
	create(manifest: PluginManifest): HostedContext {
		const kinds = new Set(manifest.kinds.map((kind) => kind.id));
		const timers: ReturnType<typeof setInterval>[] = [];
		const logger = this.#logger(manifest.id);
		const own = () =>
			DeviceDTO.all().filter((device) => kinds.has(device.kind));
		const stored = (device: PluginDevice) => {
			const found = DeviceDTO.find(device.id);
			if (!found || !kinds.has(found.kind)) {
				throw new Error(`Device ${device.id} isn't one of this plugin's.`);
			}
			return found;
		};
		return {
			logger,
			mqtt: {
				configured: () => broker.configured(),
				subscribe: (filter, listener) =>
					broker.subscribe(manifest.id, filter, listener),
				publish: (topic, payload) => broker.publish(topic, payload),
			},
			energy: {
				readings: (device) =>
					EnergyReadingDTO.since([device.id], new Date(0)).map((reading) => {
						const { hour, total } = reading.toJSON();
						return { hour, total };
					}),
				record: (device, hour, total) =>
					EnergyReadingDTO.record(stored(device).id, hour, total),
			},
			settings: () => this.settings(manifest.id),
			devices: () => own().map((device) => this.device(device)),
			device: (id) => {
				const found = DeviceDTO.find(id);
				return found && kinds.has(found.kind) ? this.device(found) : undefined;
			},
			found: (devices) => this.#found(manifest, devices),
			saveState: (device, state) => deviceEvents.save(stored(device), state),
			saveError: (device, message) => stored(device).saveError(message),
			refreshLater: (device, delayMs) => {
				JobDTO.enqueue(
					"device.refresh",
					{ deviceId: device.id },
					{ runAt: new Date(Date.now() + delayMs), maxAttempts: 1 },
				);
			},
			every: (intervalMs, task) => {
				timers.push(
					setInterval(() => {
						void Promise.resolve()
							.then(task)
							.catch((error: unknown) =>
								logger.warn("Periodic task failed", undefined, error),
							);
					}, intervalMs),
				);
			},
			notify: ({ title, body, url, audience }) => {
				JobDTO.enqueue("push.send", {
					userIds:
						audience === "admins"
							? UserDTO.adminIds()
							: UserDTO.people().map((person) => person.id),
					title,
					body,
					url: url ?? "/",
				});
			},
			folder: (...parts) => {
				const path = join(
					dirname(configuration.get().databasePath),
					"plugin-data",
					manifest.id,
					...parts.map((part) => part.replaceAll(/[^\w.-]/g, "_")),
				);
				mkdirSync(path, { recursive: true });
				return path;
			},
			sendFile: (path, request, cacheControl) =>
				fileResponse(Bun.file(path), request, cacheControl),
			dispose: () => {
				for (const timer of timers.splice(0)) {
					clearInterval(timer);
				}
				broker.unsubscribeAll(manifest.id);
			},
		};
	}

	#found(manifest: PluginManifest, devices: FoundDevice[]): number {
		const kinds = new Map(manifest.kinds.map((kind) => [kind.id, kind]));
		const homeId =
			[getPluginSettings(manifest.id)?.homeId, getSetting("mqtt")?.homeId]
				.filter((id): id is string => Boolean(id))
				.map((id) => HomeDTO.find(id))
				.find(Boolean)?.id ?? HomeDTO.first().id;
		let added = 0;
		for (const found of devices) {
			const kind = kinds.get(found.kind);
			if (!kind) {
				continue;
			}
			const existing = DeviceDTO.all().find(
				(device) =>
					device.kind === found.kind && device.externalId === found.externalId,
			);
			const row = existing?.toJSON();
			const device = DeviceDTO.upsert({
				kind: found.kind,
				homeId: row?.homeId ?? homeId,
				name: row?.name ?? found.name ?? found.externalId,
				roomId: row?.roomId ?? null,
				externalId: found.externalId,
				host: found.host ?? row?.host ?? null,
				fields: { ...row?.fields, ...found.fields },
			});
			if (found.state && device.state?.type !== found.state.type) {
				device.saveState(found.state);
			}
			if (!existing) {
				added += 1;
				if (kind.polled) {
					JobDTO.enqueue(
						"device.refresh",
						{ deviceId: device.id },
						{ maxAttempts: 1 },
					);
				}
			}
		}
		return added;
	}

	#logger(pluginId: string): PluginLogger {
		const logger = new Logger(`Plugin ${pluginId}`);
		const params = (context?: Record<string, unknown>, error?: unknown) =>
			[context, error].filter((param) => param !== undefined);
		return {
			debug: (message, context, error) =>
				logger.debug(message, ...params(context, error)),
			info: (message, context, error) =>
				logger.info(message, ...params(context, error)),
			warn: (message, context, error) =>
				logger.warn(message, ...params(context, error)),
			error: (message, context, error) =>
				logger.error(message, ...params(context, error)),
		};
	}
}

export const pluginContexts = new PluginContexts();
