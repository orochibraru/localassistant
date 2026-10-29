import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

import { CardSizeDTO } from "#lib/dto/card-size.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { access } from "#lib/server/auth/access.js";
import { devices } from "#lib/server/devices/devices.js";
import { homes } from "#lib/server/house/homes.js";
import {
	appReportSchema,
	cardSizeSchema,
	climateChangeSchema,
	coverActionSchema,
	coverGroupSchema,
	coverPositionSchema,
	printerChangeSchema,
	switchPowerSchema,
	vacuumChangeSchema,
	valveTargetSchema,
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

export const controlPrinter = command(
	printerChangeSchema,
	async ({ deviceId, ...change }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.printer(device, change));
	},
);

export const reportAppDevice = command(
	appReportSchema,
	({ deviceId, ...report }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		if (device.kind !== "app") {
			error(400, "That device isn't a phone or tablet.");
		}
		devices.reportApp(device, report);
	},
);

export const controlVacuum = command(
	vacuumChangeSchema,
	async ({ deviceId, ...change }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.vacuum(device, change));
	},
);

export const controlValve = command(
	valveTargetSchema,
	async ({ deviceId, target }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.valve(device, target));
	},
);

export const controlSwitch = command(
	switchPowerSchema,
	async ({ deviceId, on }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.switchPower(device, on));
	},
);

export const controlBlinds = command(
	coverGroupSchema,
	async ({ roomId, action }) => {
		access.requireUser();
		const homeId = homes.current(getRequestEvent().cookies).id;
		const covers = DeviceDTO.inHome(homeId).filter(
			(device) => roomId === null || device.toJSON().roomId === roomId,
		);
		const failed = await devices.coverGroup(covers, action);
		if (failed.length > 0) {
			error(
				502,
				failed.map((entry) => `${entry.name}: ${entry.error}`).join(" "),
			);
		}
	},
);

export const resizeCard = command(cardSizeSchema, ({ deviceId, size }) => {
	const user = access.requireUser();
	deviceFor(deviceId);
	CardSizeDTO.save(user.id, deviceId, size);
});
