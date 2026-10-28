import { error, fail } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { RoomDTO } from "#lib/dto/room.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";
import { melCloud } from "#lib/server/devices/melcloud.js";
import { homes } from "#lib/server/house/homes.js";
import {
	bambuPrinterSchema,
	editBambuPrinterSchema,
	editTuyaCoverSchema,
	melCloudAccountSchema,
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
