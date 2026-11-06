import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { RoomDTO } from "#lib/dto/room.js";
import { UserDTO } from "#lib/dto/user.js";
import {
	addedFromForm,
	kindInfo,
	type PluginChoice,
	type PluginField,
} from "#lib/plugins.js";
import { broker } from "#lib/server/devices/broker.js";
import { devices } from "#lib/server/devices/devices.js";
import { type HostedPlugin, plugins } from "#lib/server/plugins/registry.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";
import {
	deviceOwnerSchema,
	editAppDeviceSchema,
} from "#lib/server/validation/device.js";
import {
	type FieldErrors,
	idSchema,
	parseRecord,
} from "#lib/server/validation/form.js";
import {
	addDeviceSchema,
	connectionSchema,
	editDeviceSchema,
	fieldChoicesSchema,
	pluginIdSchema,
	valuesSchema,
} from "#lib/server/validation/plugins.js";

export type AdminOutcome<Value> =
	| { ok: true; value: Value }
	| { ok: false; status: number; error?: string; errors?: FieldErrors };

type Input = Record<string, unknown>;

/** What an admin does to the household's devices and integrations, from the web's forms or the app's JSON alike. */
class DeviceAdmin {
	/** Adds a device to `homeId` from its plugin's form; `input` names the `plugin`. */
	async add(homeId: string, input: Input): Promise<AdminOutcome<DeviceDTO>> {
		const hosted = this.#plugin(input);
		if (!hosted?.manifest.device) {
			return this.#gone("That integration is off or gone.");
		}
		const fields = await this.#fields(hosted, hosted.manifest.device.fields);
		if (!fields.ok) {
			return fields;
		}
		const parsed = parseRecord(addDeviceSchema(fields.value), input);
		if (!parsed.success) {
			return { ok: false, status: 400, errors: parsed.errors };
		}
		const { name, roomId, values } = parsed.data;
		if (this.#roomMissing(homeId, roomId)) {
			return this.#roomGone();
		}
		return await this.#attempt(() =>
			pluginSetup.addDevice(hosted, { homeId, name, roomId }, values),
		);
	}

	/** Tries the add-a-device form of the `plugin` `input` names without adding anything; what the plugin found. */
	async test(input: Input): Promise<AdminOutcome<string>> {
		const hosted = this.#plugin(input);
		if (!hosted?.manifest.device) {
			return this.#gone("That integration is off or gone.");
		}
		const fields = await this.#fields(hosted, hosted.manifest.device.fields);
		if (!fields.ok) {
			return fields;
		}
		const parsed = parseRecord(valuesSchema(fields.value, false), input);
		if (!parsed.success) {
			return { ok: false, status: 400, errors: parsed.errors };
		}
		return await this.#attempt(() => pluginSetup.test(hosted, parsed.data));
	}

	/** Saves a device's name, room, owner when it has one, and its plugin's fields; `input` names its `id`. */
	async edit(homeId: string, input: Input): Promise<AdminOutcome<DeviceDTO>> {
		const target = parseRecord(idSchema, input);
		const device = target.success
			? DeviceDTO.find(target.data.id, homeId)
			: undefined;
		if (!device) {
			return this.#gone("That device is gone.");
		}
		if (device.kind === "app") {
			return this.#editApp(homeId, device, input);
		}
		const hosted = plugins.forKind(device.kind);
		const form = hosted?.manifest.device;
		const fields =
			hosted && form && addedFromForm(device.fields, form)
				? await this.#fields(hosted, form.fields)
				: { ok: true as const, value: [] };
		if (!fields.ok) {
			return fields;
		}
		const parsed = parseRecord(editDeviceSchema(fields.value), input);
		if (!parsed.success) {
			return { ok: false, status: 400, errors: parsed.errors };
		}
		const { name, roomId, values } = parsed.data;
		if (this.#roomMissing(homeId, roomId)) {
			return this.#roomGone();
		}
		if (kindInfo(plugins.catalog(), device.kind).card === "presence") {
			const owner = parseRecord(deviceOwnerSchema, input);
			const ownerId = owner.success ? owner.data.ownerId : null;
			if (ownerId && !this.#person(ownerId)) {
				return this.#ownerGone();
			}
			this.#handOver(device, ownerId);
		}
		if (!hosted) {
			device.rename(name, roomId);
			return { ok: true, value: device };
		}
		return await this.#attempt(async () => {
			await pluginSetup.editDevice(hosted, device, { name, roomId }, values);
			return device;
		});
	}

	/** Connects the `plugin` `input` names with its connection form for `homeId`; how many devices it found, or `null`. */
	async connect(
		homeId: string,
		input: Input,
	): Promise<AdminOutcome<number | null>> {
		const hosted = this.#plugin(input);
		if (!hosted?.manifest.connection) {
			return this.#gone("That integration is off or gone.");
		}
		const connected = pluginSetup
			.setups()
			.some((setup) => setup.id === hosted.manifest.id && setup.connected);
		const fields = await this.#fields(
			hosted,
			hosted.manifest.connection.fields,
		);
		if (!fields.ok) {
			return fields;
		}
		const parsed = parseRecord(
			connectionSchema(fields.value, connected),
			input,
		);
		if (!parsed.success) {
			return { ok: false, status: 400, errors: parsed.errors };
		}
		if (hosted.manifest.needs.includes("mqtt") && !broker.configured()) {
			return {
				ok: false,
				status: 400,
				error: "Connect the MQTT broker first.",
			};
		}
		return await this.#attempt(() =>
			pluginSetup.connect(hosted, homeId, parsed.data.values),
		);
	}

	/** Has the `plugin` `input` names look for new devices; how many it found, or `null` when they come on their own. */
	async discover(input: Input): Promise<AdminOutcome<number | null>> {
		const hosted = this.#plugin(input);
		if (!hosted) {
			return this.#gone("That integration is off or gone.");
		}
		return await this.#attempt(() => pluginSetup.discover(hosted));
	}

	/** The options the `plugin` `input` names supplies for its choice `field`, asked when its form opens. */
	async choices(input: Input): Promise<AdminOutcome<PluginChoice[]>> {
		const parsed = parseRecord(fieldChoicesSchema, input);
		const hosted = parsed.success
			? pluginSetup.plugin(parsed.data.plugin)
			: undefined;
		if (!parsed.success || !hosted) {
			return this.#gone("That integration is off or gone.");
		}
		return await this.#attempt(() =>
			pluginSetup.choices(hosted, parsed.data.field),
		);
	}

	/** Forgets the `plugin` `input` names and removes its devices; how many went. */
	disconnect(input: Input): AdminOutcome<number> {
		const hosted = this.#plugin(input);
		if (!hosted) {
			return this.#gone("That integration is off or gone.");
		}
		return { ok: true, value: pluginSetup.disconnect(hosted) };
	}

	/** Removes a device of `homeId`; whether there was one. */
	remove(homeId: string, deviceId: string): boolean {
		const device = DeviceDTO.find(deviceId, homeId);
		device?.delete();
		return device !== undefined;
	}

	/** Saves a phone's or tablet's name, room and owner. */
	#editApp(
		homeId: string,
		device: DeviceDTO,
		input: Input,
	): AdminOutcome<DeviceDTO> {
		const parsed = parseRecord(editAppDeviceSchema, input);
		if (!parsed.success) {
			return { ok: false, status: 400, errors: parsed.errors };
		}
		const { name, roomId, ownerId } = parsed.data;
		if (this.#roomMissing(homeId, roomId)) {
			return this.#roomGone();
		}
		if (ownerId && !this.#person(ownerId)) {
			return this.#ownerGone();
		}
		device.rename(name, roomId);
		this.#handOver(device, ownerId);
		return { ok: true, value: device };
	}

	/** Runs `work`, turning what it throws into a 400 with the plugin's message. */
	async #attempt<Value>(
		work: () => Promise<Value>,
	): Promise<AdminOutcome<Value>> {
		try {
			return { ok: true, value: await work() };
		} catch (failure) {
			return { ok: false, status: 400, error: devices.message(failure) };
		}
	}

	/** `fields` with the options the plugin supplies filled in, or its message when it can't list them. */
	async #fields(
		hosted: HostedPlugin,
		fields: PluginField[],
	): Promise<AdminOutcome<PluginField[]>> {
		return await this.#attempt(() => pluginSetup.withChoices(hosted, fields));
	}

	/** The turned-on plugin `input` names, if any. */
	#plugin(input: Input): HostedPlugin | undefined {
		const parsed = parseRecord(pluginIdSchema, input);
		return parsed.success ? pluginSetup.plugin(parsed.data.plugin) : undefined;
	}

	/** Whether `userId` is someone's account. */
	#person(userId: string): boolean {
		return UserDTO.people().some((person) => person.id === userId);
	}

	/** Gives `device` to `ownerId` and has the worker work out again whether either owner is home. */
	#handOver(device: DeviceDTO, ownerId: string | null): void {
		const previous = device.ownerId;
		device.setOwner(ownerId);
		for (const userId of new Set([previous, ownerId])) {
			if (userId) {
				JobDTO.enqueue("presence.update", { userId }, { maxAttempts: 1 });
			}
		}
	}

	/** Whether `roomId` names a room `homeId` doesn't have. */
	#roomMissing(homeId: string, roomId: string | null): boolean {
		return roomId !== null && !RoomDTO.find(roomId, homeId);
	}

	/** A 404 saying what's gone. */
	#gone(error: string): { ok: false; status: number; error: string } {
		return { ok: false, status: 404, error };
	}

	/** A 400 on the room field. */
	#roomGone(): { ok: false; status: number; errors: FieldErrors } {
		return {
			ok: false,
			status: 400,
			errors: { roomId: ["That room is gone."] },
		};
	}

	/** A 400 on the owner field. */
	#ownerGone(): { ok: false; status: number; errors: FieldErrors } {
		return {
			ok: false,
			status: 400,
			errors: { ownerId: ["That account is gone."] },
		};
	}
}

export const deviceAdmin = new DeviceAdmin();
