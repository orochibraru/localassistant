import { DeviceDTO, type NewDevice } from "#lib/dto/device.js";
import type { Plugin, PluginDevice } from "#lib/plugin-sdk.js";
import { secrets } from "#lib/server/core/secrets.js";
import { pluginContexts } from "#lib/server/plugins/context.js";
import { type HostedPlugin, plugins } from "#lib/server/plugins/registry.js";

import { homeId } from "../database.js";

/** The official plugin `id` as the host runs it. */
export function hosted(id: string): HostedPlugin {
	const found = plugins.get(id);
	if (!found) {
		throw new Error(`No plugin ${id}`);
	}
	return found;
}

/** The official plugin `id`'s instance, typed with the extra methods a test calls. */
export function pluginOf<Extra>(id: string): Plugin & Extra {
	return hosted(id).plugin as Plugin & Extra;
}

/** A device as its plugin sees it. */
export function seen(device: DeviceDTO): PluginDevice {
	return pluginContexts.device(DeviceDTO.find(device.id) ?? device);
}

/** Adds a device with plain fields and secrets encrypted, in the test home. */
export function addDevice(
	values: Omit<NewDevice, "homeId" | "encryptedSecrets"> & {
		secrets?: Record<string, string>;
	},
): DeviceDTO {
	const { secrets: given, ...rest } = values;
	return DeviceDTO.upsert({
		...rest,
		homeId: homeId(),
		encryptedSecrets: given
			? Object.fromEntries(
					Object.entries(given).map(([name, value]) => [
						name,
						secrets.encrypt(value),
					]),
				)
			: undefined,
	});
}
