import { error, fail } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { RoomDTO } from "#lib/dto/room.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import { access } from "#lib/server/auth/access.js";
import { secrets } from "#lib/server/core/secrets.js";
import { broker } from "#lib/server/devices/broker.js";
import { devices } from "#lib/server/devices/devices.js";
import { dreameCloud } from "#lib/server/devices/dreame.js";
import { frigate } from "#lib/server/devices/frigate.js";
import { melCloud } from "#lib/server/devices/melcloud.js";
import { homes } from "#lib/server/house/homes.js";
import {
	bambuPrinterSchema,
	cameraSchema,
	dreameAccountSchema,
	editAppDeviceSchema,
	editBambuPrinterSchema,
	editCameraSchema,
	editEspHomeSchema,
	editLinkySchema,
	editTuyaCoverSchema,
	espHomeSchema,
	frigateSchema,
	linkySchema,
	melCloudAccountSchema,
	mqttBrokerSchema,
	renameDeviceSchema,
	tuyaCoverSchema,
} from "#lib/server/validation/device.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";

const melCloudKinds = ["melcloud-ata", "melcloud-atw"] as const;

function refreshSoon(deviceId: string): void {
	JobDTO.enqueue("device.refresh", { deviceId }, { maxAttempts: 1 });
}

function roomMissing(homeId: string, roomId: string | null): boolean {
	return roomId !== null && !RoomDTO.find(roomId, homeId);
}

async function importMelCloud(homeId: string): Promise<number> {
	const found = await melCloud.devices();
	const known = new Set(
		DeviceDTO.all().map((device) => `${device.kind}:${device.externalId}`),
	);
	for (const unit of found) {
		if (known.has(`${unit.kind}:${unit.deviceId}`)) {
			continue;
		}
		const device = DeviceDTO.upsert({
			kind: unit.kind,
			homeId,
			name: unit.name,
			externalId: String(unit.deviceId),
			buildingId: unit.buildingId,
		});
		refreshSoon(device.id);
	}
	return found.length;
}

async function importDreame(homeId: string): Promise<number> {
	const found = await dreameCloud.devices();
	for (const robot of found) {
		const existing = DeviceDTO.all().find(
			(device) =>
				device.kind === "dreame-vacuum" && device.externalId === robot.did,
		);
		const device = DeviceDTO.upsert({
			kind: "dreame-vacuum",
			homeId: existing?.toJSON().homeId ?? homeId,
			name: existing?.toJSON().name ?? robot.name,
			roomId: existing?.toJSON().roomId ?? null,
			externalId: robot.did,
			host: robot.bindDomain,
		});
		refreshSoon(device.id);
	}
	return found.length;
}

export const load = async ({ parent }) => {
	const { isAdmin, home } = await parent();
	if (!isAdmin) {
		error(404, "Not found");
	}
	return {
		devices: DeviceDTO.inHome(home.id).map((device) => device.toJSON()),
		melCloudEmail: getSetting("melcloud")?.email ?? null,
	};
};

export const actions = {
	addTuya: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(tuyaCoverSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (roomMissing(home.id, parsed.data.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const { localKey, ...rest } = parsed.data;
		const device = DeviceDTO.upsert({
			kind: "tuya-cover",
			homeId: home.id,
			...rest,
			encryptedLocalKey: secrets.encrypt(localKey),
		});
		refreshSoon(device.id);
		return { added: true };
	},
	editTuya: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(editTuyaCoverSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (roomMissing(home.id, parsed.data.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const { id, localKey, ...rest } = parsed.data;
		const device = DeviceDTO.find(id, home.id);
		if (device?.kind !== "tuya-cover") {
			return fail(404, { error: "That blind is gone." });
		}
		device.reconfigure({
			...rest,
			encryptedLocalKey: localKey ? secrets.encrypt(localKey) : undefined,
		});
		refreshSoon(device.id);
		return { saved: true };
	},
	addBambu: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(bambuPrinterSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (roomMissing(home.id, parsed.data.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const { accessCode, ...rest } = parsed.data;
		const device = DeviceDTO.upsert({
			kind: "bambu-printer",
			homeId: home.id,
			...rest,
			encryptedLocalKey: secrets.encrypt(accessCode),
		});
		refreshSoon(device.id);
		return { added: true };
	},
	editBambu: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(editBambuPrinterSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (roomMissing(home.id, parsed.data.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const { id, accessCode, ...rest } = parsed.data;
		const device = DeviceDTO.find(id, home.id);
		if (device?.kind !== "bambu-printer") {
			return fail(404, { error: "That printer is gone." });
		}
		device.reconnect({
			...rest,
			encryptedLocalKey: accessCode ? secrets.encrypt(accessCode) : undefined,
		});
		refreshSoon(device.id);
		return { saved: true };
	},
	connectMelCloud: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(melCloudAccountSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			await melCloud.signIn(parsed.data.email, parsed.data.password);
			setSetting("melcloud", {
				email: parsed.data.email,
				encryptedPassword: secrets.encrypt(parsed.data.password),
			});
			return { imported: await importMelCloud(home.id) };
		} catch (error) {
			return fail(400, { error: devices.message(error) });
		}
	},
	syncMelCloud: async ({ cookies, locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		if (!melCloud.configured()) {
			return fail(400, { error: "Connect a MELCloud account first." });
		}
		try {
			return { imported: await importMelCloud(home.id) };
		} catch (error) {
			return fail(400, { error: devices.message(error) });
		}
	},
	disconnectMelCloud: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		setSetting("melcloud", null);
		return { removed: DeviceDTO.removeKinds([...melCloudKinds]) };
	},
	connectDreame: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(dreameAccountSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { email, password, region } = parsed.data;
		try {
			await dreameCloud.signIn(email, password, region);
			setSetting("dreame", {
				email,
				region,
				encryptedPassword: secrets.encrypt(password),
			});
			return { imported: await importDreame(home.id) };
		} catch (error) {
			return fail(400, { error: devices.message(error) });
		}
	},
	syncDreame: async ({ cookies, locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		if (!dreameCloud.configured()) {
			return fail(400, { error: "Connect a Dreamehome account first." });
		}
		try {
			return { imported: await importDreame(homes.current(cookies).id) };
		} catch (error) {
			return fail(400, { error: devices.message(error) });
		}
	},
	disconnectDreame: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		setSetting("dreame", null);
		return { removed: DeviceDTO.removeKinds(["dreame-vacuum"]) };
	},
	addLinky: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(linkySchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (roomMissing(home.id, parsed.data.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const { token, ...rest } = parsed.data;
		const device = DeviceDTO.upsert({
			kind: "linky",
			homeId: home.id,
			...rest,
			encryptedLocalKey: secrets.encrypt(token),
		});
		refreshSoon(device.id);
		return { added: true };
	},
	editLinky: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(editLinkySchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { id, token, ...rest } = parsed.data;
		if (roomMissing(home.id, rest.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const device = DeviceDTO.find(id, home.id);
		if (device?.kind !== "linky") {
			return fail(404, { error: "That meter is gone." });
		}
		const taken = DeviceDTO.all().some(
			(other) =>
				other.kind === "linky" &&
				other.externalId === rest.externalId &&
				other.id !== id,
		);
		if (taken) {
			return fail(400, {
				errors: { externalId: ["Another Linky already reads this PRM."] },
			});
		}
		device.relink({
			...rest,
			encryptedLocalKey: token ? secrets.encrypt(token) : undefined,
		});
		refreshSoon(device.id);
		return { saved: true };
	},
	addCamera: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(cameraSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (roomMissing(home.id, parsed.data.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const { url, record, retentionDays, ...rest } = parsed.data;
		DeviceDTO.upsert({
			kind: "camera",
			homeId: home.id,
			...rest,
			externalId: crypto.randomUUID(),
			host: new URL(url).hostname,
			encryptedLocalKey: secrets.encrypt(url),
			options: { record, retentionDays },
		});
		JobDTO.enqueue("cameras.sync", {}, { maxAttempts: 1 });
		return { added: true };
	},
	editCamera: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(editCameraSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { id, name, roomId, url, record, retentionDays } = parsed.data;
		if (roomMissing(home.id, roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const device = DeviceDTO.find(id, home.id);
		if (device?.kind !== "camera") {
			return fail(404, { error: "That camera is gone." });
		}
		device.reconnect({
			name,
			roomId,
			host: url ? new URL(url).hostname : (device.host ?? ""),
			encryptedLocalKey: url ? secrets.encrypt(url) : undefined,
		});
		device.setOptions({ ...device.options, record, retentionDays });
		JobDTO.enqueue("cameras.sync", {}, { maxAttempts: 1 });
		return { saved: true };
	},
	connectFrigate: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(frigateSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		try {
			await frigate.cameraNames(parsed.data);
			setSetting("frigate", {
				...parsed.data,
				homeId: homes.current(cookies).id,
			});
			return { imported: await frigate.import() };
		} catch (error) {
			return fail(400, { error: devices.message(error) });
		}
	},
	syncFrigate: async ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		try {
			return { imported: await frigate.import() };
		} catch (error) {
			return fail(400, { error: devices.message(error) });
		}
	},
	disconnectFrigate: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		setSetting("frigate", null);
		return { removed: DeviceDTO.removeKinds(["frigate-camera"]) };
	},
	addEspHome: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(espHomeSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (roomMissing(home.id, parsed.data.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const { objectId, username, password, ...rest } = parsed.data;
		const device = DeviceDTO.upsert({
			kind: "esphome-climate",
			homeId: home.id,
			...rest,
			externalId: `${rest.host}/${objectId}`,
			options: { objectId },
			encryptedLocalKey:
				username && password
					? secrets.encrypt(`${username}:${password}`)
					: undefined,
		});
		refreshSoon(device.id);
		return { added: true };
	},
	editEspHome: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(editEspHomeSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { id, objectId, username, password, ...rest } = parsed.data;
		if (roomMissing(home.id, rest.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const device = DeviceDTO.find(id, home.id);
		if (device?.kind !== "esphome-climate") {
			return fail(404, { error: "That unit is gone." });
		}
		device.reconnect({
			...rest,
			encryptedLocalKey:
				username && password
					? secrets.encrypt(`${username}:${password}`)
					: undefined,
		});
		device.setOptions({ ...device.options, objectId });
		refreshSoon(device.id);
		return { saved: true };
	},
	connectBroker: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(mqttBrokerSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { password, ...rest } = parsed.data;
		const settings = {
			...rest,
			encryptedPassword: password ? secrets.encrypt(password) : null,
			homeId: homes.current(cookies).id,
		};
		try {
			await broker.check(settings);
		} catch (error) {
			return fail(400, { error: devices.message(error) });
		}
		setSetting("mqtt", settings);
		JobDTO.enqueue("broker.connect", {}, { maxAttempts: 1 });
		return { connected: true };
	},
	syncBroker: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		JobDTO.enqueue("broker.connect", {}, { maxAttempts: 1 });
		return { queued: true };
	},
	disconnectBroker: ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		setSetting("mqtt", null);
		JobDTO.enqueue("broker.connect", {}, { maxAttempts: 1 });
		return {
			removed: DeviceDTO.removeKinds([
				"zigbee-contact",
				"zigbee-valve",
				"zigbee-switch",
				"zigbee-meter",
			]),
		};
	},
	rename: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const home = homes.current(cookies);
		const parsed = parseForm(renameDeviceSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		if (roomMissing(home.id, parsed.data.roomId)) {
			return fail(400, { errors: { roomId: ["That room is gone."] } });
		}
		const device = DeviceDTO.find(parsed.data.id, home.id);
		if (!device) {
			return fail(404, { error: "That device is gone." });
		}
		device.rename(parsed.data.name, parsed.data.roomId);
		return { renamed: true };
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
		device.setOwner(ownerId);
		return { saved: true };
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
