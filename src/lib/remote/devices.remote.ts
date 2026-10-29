import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

import { CardLayoutDTO } from "#lib/dto/card-layout.js";
import { CardSizeDTO } from "#lib/dto/card-size.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { access } from "#lib/server/auth/access.js";
import { devices } from "#lib/server/devices/devices.js";
import { homes } from "#lib/server/house/homes.js";
import {
	appReportSchema,
	buttonSchema,
	cardDetailsSchema,
	cardOrderSchema,
	cardSizeSchema,
	climateChangeSchema,
	coverActionSchema,
	coverGroupSchema,
	coverPositionSchema,
	fanChangeSchema,
	lightChangeSchema,
	lockSchema,
	mediaChangeSchema,
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
		await attempt(() =>
			devices.command(device, { type: "cover", move: { action } }),
		);
	},
);

export const moveCover = command(
	coverPositionSchema,
	async ({ deviceId, position }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() =>
			devices.command(device, { type: "cover", move: { position } }),
		);
	},
);

export const controlClimate = command(
	climateChangeSchema,
	async ({ deviceId, ...change }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.command(device, { type: "climate", change }));
	},
);

export const controlPrinter = command(
	printerChangeSchema,
	async ({ deviceId, ...change }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.command(device, { type: "printer", change }));
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
		await attempt(() => devices.command(device, { type: "vacuum", change }));
	},
);

export const controlValve = command(
	valveTargetSchema,
	async ({ deviceId, target }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.command(device, { type: "valve", target }));
	},
);

export const controlSwitch = command(
	switchPowerSchema,
	async ({ deviceId, on }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.command(device, { type: "switch", on }));
	},
);

export const controlLight = command(
	lightChangeSchema,
	async ({ deviceId, ...change }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.command(device, { type: "light", change }));
	},
);

export const controlLock = command(lockSchema, async ({ deviceId, locked }) => {
	access.requireUser();
	const device = deviceFor(deviceId);
	await attempt(() => devices.command(device, { type: "lock", locked }));
});

export const controlFan = command(
	fanChangeSchema,
	async ({ deviceId, ...change }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.command(device, { type: "fan", change }));
	},
);

export const controlMedia = command(
	mediaChangeSchema,
	async ({ deviceId, ...change }) => {
		access.requireUser();
		const device = deviceFor(deviceId);
		await attempt(() => devices.command(device, { type: "media", change }));
	},
);

export const pressButton = command(buttonSchema, async ({ deviceId }) => {
	access.requireUser();
	const device = deviceFor(deviceId);
	await attempt(() => devices.command(device, { type: "button" }));
});

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

export const arrangeCards = command(cardOrderSchema, ({ deviceIds }) => {
	const user = access.requireUser();
	CardLayoutDTO.arrange(user.id, deviceIds);
});

export const showCardDetails = command(
	cardDetailsSchema,
	({ deviceId, shown }) => {
		const user = access.requireUser();
		deviceFor(deviceId);
		CardLayoutDTO.showDetails(user.id, deviceId, shown);
	},
);
