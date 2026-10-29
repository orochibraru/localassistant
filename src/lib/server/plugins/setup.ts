import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { getPluginSettings, setPluginSettings } from "#lib/dto/setting.js";
import type { PluginField, PluginSetup, PluginValues } from "#lib/plugins.js";
import { secrets } from "#lib/server/core/secrets.js";
import { pluginContexts } from "#lib/server/plugins/context.js";
import { type HostedPlugin, plugins } from "#lib/server/plugins/registry.js";

interface Split {
	plain: PluginValues;
	encrypted: Record<string, string>;
}

/** Connects plugins and adds and sets up their devices, from what an admin typed in the forms their manifests describe. */
class PluginSetupService {
	/** The setup sheets of every plugin that's turned on, with what each is connected with, secrets left out. */
	setups(): PluginSetup[] {
		return plugins
			.all()
			.filter((hosted) => plugins.enabled(hosted.manifest.id))
			.map(({ manifest }) => {
				const stored = getPluginSettings(manifest.id);
				return {
					id: manifest.id,
					name: manifest.name,
					description: manifest.description,
					icon: manifest.icon,
					needs: manifest.needs,
					connection: manifest.connection ?? null,
					device: manifest.device ?? null,
					automatic: manifest.automatic ?? null,
					connected: stored !== null,
					values: stored?.values ?? {},
					secretsSet: Object.keys(stored?.secrets ?? {}),
				};
			});
	}

	/** The plugin `id`, when it's loaded and turned on. */
	plugin(id: string): HostedPlugin | undefined {
		const hosted = plugins.get(id);
		return hosted && plugins.enabled(id) ? hosted : undefined;
	}

	/**
	 * Checks `values` with the plugin, stores them as its connection for `homeId`, restarts it in the worker and, when it
	 * can, looks for its devices; returns how many it found, or `null` when they show up on their own.
	 *
	 * @throws When the plugin refuses the values or can't reach what they point at.
	 */
	async connect(
		hosted: HostedPlugin,
		homeId: string,
		values: PluginValues,
	): Promise<number | null> {
		const { manifest, plugin, context } = hosted;
		const fields = manifest.connection?.fields ?? [];
		const stored = getPluginSettings(manifest.id);
		const merged = {
			...(pluginContexts.settings(manifest.id) ?? {}),
			...values,
		};
		await plugin.connect?.(merged, context);
		const split = this.#split(fields, values);
		setPluginSettings(manifest.id, {
			homeId,
			values: split.plain,
			secrets: { ...stored?.secrets, ...split.encrypted },
		});
		JobDTO.enqueue(
			"plugins.restart",
			{ pluginId: manifest.id },
			{ maxAttempts: 1 },
		);
		return this.discover(hosted);
	}

	/**
	 * Looks for new devices through the plugin, or restarts it in the worker so pushed ones announce themselves again;
	 * returns how many new it found, or `null` when they show up on their own.
	 *
	 * @throws When the plugin can't reach its devices.
	 */
	async discover(hosted: HostedPlugin): Promise<number | null> {
		if (!hosted.plugin.discover) {
			JobDTO.enqueue(
				"plugins.restart",
				{ pluginId: hosted.manifest.id },
				{ maxAttempts: 1 },
			);
			return null;
		}
		return hosted.context.found(await hosted.plugin.discover(hosted.context));
	}

	/** Forgets the plugin's connection and removes its devices; returns how many went. */
	disconnect(hosted: HostedPlugin): number {
		setPluginSettings(hosted.manifest.id, null);
		JobDTO.enqueue(
			"plugins.restart",
			{ pluginId: hosted.manifest.id },
			{ maxAttempts: 1 },
		);
		return DeviceDTO.removeKinds(hosted.manifest.kinds.map((kind) => kind.id));
	}

	/**
	 * Adds a device from the plugin's form: the plugin turns `values` into the device it means, secrets are stored
	 * encrypted, and the worker reads it soon.
	 *
	 * @throws When the plugin refuses the values or another device already has the same id.
	 */
	async addDevice(
		hosted: HostedPlugin,
		target: { homeId: string; name: string; roomId: string | null },
		values: PluginValues,
	): Promise<DeviceDTO> {
		const fields = hosted.manifest.device?.fields ?? [];
		const found = await this.#found(hosted, values);
		const split = this.#split(fields, values);
		const device = this.#unique(() =>
			DeviceDTO.upsert({
				...target,
				kind: found.kind,
				externalId: found.externalId,
				host: found.host ?? null,
				fields: { ...split.plain, ...found.fields },
				encryptedSecrets: split.encrypted,
			}),
		);
		this.#refreshSoon(hosted, device);
		return device;
	}

	/**
	 * Saves a device's settings: its name and room, and its plugin's fields with empty secrets kept.
	 *
	 * @throws When the plugin refuses the values or another device already has the same id.
	 */
	async editDevice(
		hosted: HostedPlugin,
		device: DeviceDTO,
		target: { name: string; roomId: string | null },
		values: PluginValues,
	): Promise<void> {
		const fields = hosted.manifest.device?.fields ?? [];
		if (fields.length === 0) {
			device.rename(target.name, target.roomId);
			return;
		}
		const current = pluginContexts.device(device);
		const decrypted = Object.fromEntries(
			fields.flatMap((field) => {
				const secret =
					field.type === "secret" ? current.secret(field.name) : null;
				return secret === null ? [] : [[field.name, secret]];
			}),
		);
		const merged = { ...current.fields, ...decrypted, ...values };
		const found = await this.#found(hosted, merged);
		const split = this.#split(fields, merged);
		this.#unique(() =>
			device.configure({
				...target,
				externalId: found.externalId,
				host: found.host ?? null,
				fields: { ...split.plain, ...found.fields },
				encryptedSecrets: {
					...device.encryptedSecrets(),
					...this.#split(fields, values).encrypted,
				},
			}),
		);
		this.#refreshSoon(hosted, device);
	}

	async #found(hosted: HostedPlugin, values: PluginValues) {
		if (!hosted.plugin.add) {
			throw new Error(`${hosted.manifest.name} doesn't add devices by hand.`);
		}
		const found = await hosted.plugin.add(values, hosted.context);
		if (!hosted.manifest.kinds.some((kind) => kind.id === found.kind)) {
			throw new Error(
				`${hosted.manifest.name} answered with a kind it doesn't declare.`,
			);
		}
		return found;
	}

	#unique<Result>(work: () => Result): Result {
		try {
			return work();
		} catch (error) {
			if (error instanceof Error && /UNIQUE constraint/i.test(error.message)) {
				throw new Error(
					"Another device of that kind already has the same id.",
					{ cause: error },
				);
			}
			throw error;
		}
	}

	#refreshSoon(hosted: HostedPlugin, device: DeviceDTO): void {
		if (hosted.manifest.kinds.find((kind) => kind.id === device.kind)?.polled) {
			JobDTO.enqueue(
				"device.refresh",
				{ deviceId: device.id },
				{ maxAttempts: 1 },
			);
		}
	}

	#split(fields: PluginField[], values: PluginValues): Split {
		const secretNames = new Set(
			fields
				.filter((field) => field.type === "secret")
				.map((field) => field.name),
		);
		const plain: PluginValues = {};
		const encrypted: Record<string, string> = {};
		for (const [name, value] of Object.entries(values)) {
			if (secretNames.has(name)) {
				encrypted[name] = secrets.encrypt(String(value));
			} else if (fields.some((field) => field.name === name)) {
				plain[name] = value;
			}
		}
		return { plain, encrypted };
	}
}

export const pluginSetup = new PluginSetupService();
