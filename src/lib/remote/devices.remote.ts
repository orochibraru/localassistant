import { command } from "$app/server";
import { error } from "@sveltejs/kit";

import { DeviceDTO } from "#lib/dto/device.js";
import { access } from "#lib/server/auth/access.js";
import { devices } from "#lib/server/devices/devices.js";
import {
	climateChangeSchema,
	coverActionSchema,
	coverPositionSchema,
} from "#lib/server/validation/device.js";

function deviceFor(deviceId: string): DeviceDTO {
	const device = DeviceDTO.find(deviceId);
	if (!device) {
		error(404, "That device is gone.");
	}
	return device;
}

async function attempt(work: () => Promise<void>): Promise<void> {
	try {
		await work();
	} catch (failure) {
		error(502, devices.message(failure));
	}
}

export const controlCover = command(
	coverActionSchema,
	async ({ deviceId, action }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.coverAction(device, action));
	},
);

export const moveCover = command(
	coverPositionSchema,
	async ({ deviceId, position }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.coverPosition(device, position));
	},
);

export const controlClimate = command(
	climateChangeSchema,
	async ({ deviceId, ...change }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.climate(device, change));
	},
);
