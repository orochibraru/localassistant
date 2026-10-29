import { error, fail } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { RoomDTO } from "#lib/dto/room.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import { kindInfo } from "#lib/plugins.js";
import { access } from "#lib/server/auth/access.js";
import { secrets } from "#lib/server/core/secrets.js";
import { broker } from "#lib/server/devices/broker.js";
import { devices } from "#lib/server/devices/devices.js";
import { homes } from "#lib/server/house/homes.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";
import {
	deviceOwnerSchema,
	editAppDeviceSchema,
} from "#lib/server/validation/device.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";
import {
	addDeviceSchema,
	brokerSchema,
	connectionSchema,
	editDeviceSchema,
	pluginIdSchema,
} from "#lib/server/validation/plugins.js";

function roomMissing(homeId: string, roomId: string | null): boolean {
	return roomId !== null && !RoomDTO.find(roomId, homeId);
}

function pluginFrom(formData: FormData) {
	const parsed = parseForm(pluginIdSchema, formData);
	return parsed.success ? pluginSetup.plugin(parsed.data.plugin) : undefined;
}

function handOver(device: DeviceDTO, ownerId: string | null): void {
	const previous = device.ownerId;
	device.setOwner(ownerId);
	for (const userId of new Set([previous, ownerId])) {
		if (userId) {
			JobDTO.enqueue("presence.update", { userId }, { maxAttempts: 1 });
		}
	}
}

export const load = async ({ parent }) => {
	const { isAdmin, home } = await parent();
	if (!isAdmin) {
		error(404, "Not found");
	}
	return {
		devices: DeviceDTO.inHome(home.id).map((device) => device.toJSON()),
	};
};

export const actions = {
	add: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const formData = await request.formData();
		const hosted = pluginFrom(formData);
		if (!hosted?.manifest.device) {
			return fail(404, { error: "That integration is off or gone." });
		}
		const parsed = parseForm(
			addDeviceSchema(hosted.manifest.device.fields),
			formData,
		);
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { name, roomId, values } = parsed.data;
		if (roomMissing(home.id, roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		try {
			await pluginSetup.addDevice(
				hosted,
				{ homeId: home.id, name, roomId },
				values,
			);
		} catch (failure) {
			return fail(400, { error: devices.message(failure) });
		}
		return { added: true };
	},
	edit: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const formData = await request.formData();
		const target = parseForm(idSchema, formData);
		const device = target.success
			? DeviceDTO.find(target.data.id, home.id)
			: undefined;
		if (!device) {
			return fail(404, { error: "That device is gone." });
		}
		const hosted = plugins.forKind(device.kind);
		const parsed = parseForm(
			editDeviceSchema(hosted?.manifest.device?.fields ?? []),
			formData,
		);
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { name, roomId, values } = parsed.data;
		if (roomMissing(home.id, roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		if (kindInfo(plugins.catalog(), device.kind).card === "presence") {
			const owner = parseForm(deviceOwnerSchema, formData);
			const ownerId = owner.success ? owner.data.ownerId : null;
			if (
				ownerId &&
				!UserDTO.people().some((person) => person.id === ownerId)
			) {
				return fail(400, { errors: { ownerId: ["That account is gone."] } });
			}
			handOver(device, ownerId);
		}
		if (!hosted) {
			device.rename(name, roomId);
			return { saved: true };
		}
		try {
			await pluginSetup.editDevice(hosted, device, { name, roomId }, values);
		} catch (failure) {
			return fail(400, { error: devices.message(failure) });
		}
		return { saved: true };
	},
	editApp: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(editAppDeviceSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { id, name, roomId, ownerId } = parsed.data;
		if (roomMissing(home.id, roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		if (ownerId && !UserDTO.people().some((person) => person.id === ownerId)) {
			return fail(400, { errors: { ownerId: ["That account is gone."] } });
		}
		const device = DeviceDTO.find(id, home.id);
		if (device?.kind !== "app") {
			return fail(404, { error: "That device is gone." });
		}
		device.rename(name, roomId);
		handOver(device, ownerId);
		return { saved: true };
	},
	connect: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const formData = await request.formData();
		const hosted = pluginFrom(formData);
		if (!hosted?.manifest.connection) {
			return fail(404, { error: "That integration is off or gone." });
		}
		const connected = pluginSetup
			.setups()
			.some((setup) => setup.id === hosted.manifest.id && setup.connected);
		const parsed = parseForm(
			connectionSchema(hosted.manifest.connection.fields, connected),
			formData,
		);
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (hosted.manifest.needs.includes("mqtt") && !broker.configured()) {
			return fail(400, { error: "Connect the MQTT broker first." });
		}
		try {
			return {
				found: await pluginSetup.connect(
					hosted,
					homes.current(cookies).id,
					parsed.data.values,
				),
			};
		} catch (failure) {
			return fail(400, { error: devices.message(failure) });
		}
	},
	discover: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const hosted = pluginFrom(await request.formData());
		if (!hosted) {
			return fail(404, { error: "That integration is off or gone." });
		}
		try {
			return { found: await pluginSetup.discover(hosted) };
		} catch (failure) {
			return fail(400, { error: devices.message(failure) });
		}
	},
	disconnect: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const hosted = pluginFrom(await request.formData());
		if (!hosted) {
			return fail(404, { error: "That integration is off or gone." });
		}
		return { removed: pluginSetup.disconnect(hosted) };
	},
	connectBroker: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(brokerSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { password, ...rest } = parsed.data;
		const current = getSetting("mqtt");
		const settings = {
			...rest,
			encryptedPassword: password
				? secrets.encrypt(password)
				: (current?.encryptedPassword ?? null),
			homeId: homes.current(cookies).id,
		};
		try {
			await broker.check(settings);
		} catch (failure) {
			return fail(400, { error: devices.message(failure) });
		}
		setSetting("mqtt", settings);
		JobDTO.enqueue("broker.connect", {}, { maxAttempts: 1 });
		return { connected: true };
	},
	disconnectBroker: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		setSetting("mqtt", null);
		JobDTO.enqueue("broker.connect", {}, { maxAttempts: 1 });
		return { disconnected: true };
	},
	remove: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(idSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a device." });
		}
		DeviceDTO.find(parsed.data.id, home.id)?.delete();
		return { removed: true };
	},
};
