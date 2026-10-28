import { fail } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";
import { melCloud } from "#lib/server/devices/melcloud.js";
import {
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

async function importMelCloud(): Promise<number> {
	const found = await melCloud.devices();
	for (const unit of found) {
		const device = DeviceDTO.upsert({
			kind: unit.kind,
			name: unit.name,
			externalId: String(unit.deviceId),
			buildingId: unit.buildingId,
		});
		refreshSoon(device.id);
	}
	return found.length;
}

export const load = async ({ parent }) => {
	await parent();
	return {
		devices: DeviceDTO.all().map((device) => device.toJSON()),
		melCloudEmail: getSetting("melcloud")?.email ?? null,
	};
};

export const actions = {
	addTuya: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(tuyaCoverSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { localKey, ...rest } = parsed.data;
		const device = DeviceDTO.upsert({
			kind: "tuya-cover",
			...rest,
			encryptedLocalKey: secrets.encrypt(localKey),
		});
		refreshSoon(device.id);
		return { added: true };
	},
	editTuya: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(editTuyaCoverSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const { id, localKey, ...rest } = parsed.data;
		const device = DeviceDTO.find(id);
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
	connectMelCloud: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
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
			return { imported: await importMelCloud() };
		} catch (error) {
			return fail(400, { error: devices.message(error) });
		}
	},
	syncMelCloud: async ({ locals }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		if (!melCloud.configured()) {
			return fail(400, { error: "Connect a MELCloud account first." });
		}
		try {
			return { imported: await importMelCloud() };
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
	rename: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(renameDeviceSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { errors: parsed.errors });
		}
		const device = DeviceDTO.find(parsed.data.id);
		if (!device) {
			return fail(404, { error: "That device is gone." });
		}
		device.rename(parsed.data.name);
		return { renamed: true };
	},
	remove: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const parsed = parseForm(idSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a device." });
		}
		DeviceDTO.find(parsed.data.id)?.delete();
		return { removed: true };
	},
};
