import { error, fail } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { access } from "#lib/server/auth/access.js";
import { secrets } from "#lib/server/core/secrets.js";
import { broker } from "#lib/server/devices/broker.js";
import {
	type AdminOutcome,
	deviceAdmin,
} from "#lib/server/devices/device-admin.js";
import { devices } from "#lib/server/devices/devices.js";
import { homes } from "#lib/server/house/homes.js";
import { idSchema, parseForm } from "#lib/server/validation/form.js";
import { brokerSchema } from "#lib/server/validation/plugins.js";

function failed(outcome: Extract<AdminOutcome<unknown>, { ok: false }>) {
	return fail(outcome.status, {
		error: outcome.error,
		errors: outcome.errors,
	});
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
		const outcome = await deviceAdmin.add(
			homes.current(cookies).id,
			Object.fromEntries(await request.formData()),
		);
		return outcome.ok ? { added: true } : failed(outcome);
	},
	edit: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const outcome = await deviceAdmin.edit(
			homes.current(cookies).id,
			Object.fromEntries(await request.formData()),
		);
		return outcome.ok ? { saved: true } : failed(outcome);
	},
	editApp: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const outcome = await deviceAdmin.edit(
			homes.current(cookies).id,
			Object.fromEntries(await request.formData()),
		);
		return outcome.ok ? { saved: true } : failed(outcome);
	},
	connect: async ({ cookies, locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const outcome = await deviceAdmin.connect(
			homes.current(cookies).id,
			Object.fromEntries(await request.formData()),
		);
		return outcome.ok ? { found: outcome.value } : failed(outcome);
	},
	discover: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const outcome = await deviceAdmin.discover(
			Object.fromEntries(await request.formData()),
		);
		return outcome.ok ? { found: outcome.value } : failed(outcome);
	},
	disconnect: async ({ locals, request }) => {
		const admin = access.adminFrom(locals);
		if (!("id" in admin)) {
			return admin;
		}
		const outcome = deviceAdmin.disconnect(
			Object.fromEntries(await request.formData()),
		);
		return outcome.ok ? { removed: outcome.value } : failed(outcome);
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
		const parsed = parseForm(idSchema, await request.formData());
		if (!parsed.success) {
			return fail(400, { error: "Pick a device." });
		}
		deviceAdmin.remove(homes.current(cookies).id, parsed.data.id);
		return { removed: true };
	},
};
