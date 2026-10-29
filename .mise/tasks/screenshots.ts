#!/usr/bin/env bun
//MISE description="Build the app, boot it on a seeded demo database and take the docs screenshots into docs/images"
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
	type BrowserContextOptions,
	chromium,
	type Page,
} from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { $, Image } from "bun";

import { presets } from "#lib/automations.js";
import type { DeviceState } from "#lib/devices.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { EnergyReadingDTO } from "#lib/dto/energy-reading.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import { configuration } from "#lib/server/core/config.js";
import { secrets } from "#lib/server/core/secrets.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { account, user } from "#lib/server/db/schema.js";

const root = join(import.meta.dir, "..", "..");
const work = join(root, "tmp", "screenshots");
const images = join(root, "docs", "images");
const port = 4319;
const origin = `http://localhost:${port}`;
const email = "ada@localassistant.example";
const password = "Showcase-Password-2026";
const secret = "screenshots-only-secret-not-for-production-use";

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(images, { recursive: true });

process.stdout.write("Building the app\n");
await $`bun run build`.cwd(root).quiet();

configuration.set({
	appVersion: "0.0.0",
	origin,
	databasePath: join(work, "localassistant.sqlite"),
	signInMethods: undefined,
	logLevel: "warn",
	logFormat: "console",
	auth: { secret },
	worker: { concurrency: 1, pollIntervalMs: 1000 },
});
databaseConnection.migrate();

process.stdout.write("Seeding the demo\n");
databaseConnection
	.get()
	.insert(user)
	.values({
		id: "ada",
		name: "Ada",
		email,
		emailVerified: true,
		role: "admin",
	})
	.run();
databaseConnection
	.get()
	.insert(account)
	.values({
		id: "ada-credential",
		accountId: "ada",
		providerId: "credential",
		userId: "ada",
		password: await hashPassword(password),
		createdAt: new Date(),
		updatedAt: new Date(),
	})
	.run();

const homeId = HomeDTO.first().id;
const ground = FloorDTO.create(homeId, "Ground floor", 0).toJSON().id;
const first = FloorDTO.create(homeId, "First floor", 1).toJSON().id;
const rooms = Object.fromEntries(
	(
		[
			["Living room", "living", ground, false],
			["Kitchen", "kitchen", ground, false],
			["Bedroom", "bedroom", first, false],
			["Office", "office", first, false],
			["Garage", "garage", null, true],
			["Workshop", "workshop", null, true],
		] as const
	).map(([name, icon, floorId, outdoor]) => [
		name,
		RoomDTO.create(homeId, { name, icon, floorId, outdoor }).toJSON().id,
	]),
);

const demo: [DeviceDTO, DeviceState][] = [
	[
		DeviceDTO.upsert({
			homeId,
			kind: "melcloud-ata",
			name: "Living room",
			roomId: rooms["Living room"],
			externalId: "1001",
			buildingId: 1,
		}),
		{
			type: "climate",
			power: true,
			mode: "heat",
			modes: ["heat", "dry", "cool", "fan", "auto"],
			targetTemperature: 21,
			roomTemperature: 19.5,
			minTemperature: 10,
			maxTemperature: 31,
			offline: false,
		},
	],
	[
		DeviceDTO.upsert({
			homeId,
			kind: "melcloud-ata",
			name: "Bedroom",
			roomId: rooms.Bedroom,
			externalId: "1002",
			buildingId: 1,
		}),
		{
			type: "climate",
			power: false,
			mode: "heat",
			modes: ["heat", "dry", "cool", "fan", "auto"],
			targetTemperature: 18,
			roomTemperature: 17,
			minTemperature: 10,
			maxTemperature: 31,
			offline: false,
		},
	],
	[
		DeviceDTO.upsert({
			homeId,
			kind: "melcloud-atw",
			name: "Heat pump",
			externalId: "1003",
			buildingId: 1,
		}),
		{
			type: "climate",
			power: true,
			mode: null,
			modes: [],
			targetTemperature: 19.5,
			roomTemperature: 20,
			minTemperature: 10,
			maxTemperature: 30,
			offline: false,
			hotWater: { boost: false, temperature: 47, target: 50 },
		},
	],
	[
		DeviceDTO.upsert({
			homeId,
			kind: "bambu-printer",
			name: "P1S",
			roomId: rooms.Workshop,
			externalId: "01P00A000000000",
			host: "192.0.2.50",
			encryptedLocalKey: secrets.encrypt("12345678"),
		}),
		{
			type: "printer",
			stage: "printing",
			progress: 42,
			remainingMinutes: 75,
			fileName: "planter_v3",
			layer: 120,
			totalLayers: 300,
			nozzle: { temperature: 219.6, target: 220 },
			bed: { temperature: 60, target: 60 },
			light: true,
			speed: 2,
		},
	],
	...(
		[
			["Living room blind", 100, "Living room"],
			["Kitchen blind", 40, "Kitchen"],
			["Bedroom blind", 0, "Bedroom"],
		] as const
	).map(([name, position, room], index): [DeviceDTO, DeviceState] => [
		DeviceDTO.upsert({
			homeId,
			kind: "tuya-cover",
			name,
			roomId: rooms[room],
			externalId: `bfdemo00000000000${index}`,
			host: `192.0.2.${10 + index}`,
			protocolVersion: "3.3",
			encryptedLocalKey: secrets.encrypt("abcdabcdabcdabcd"),
		}),
		{ type: "cover", position },
	]),
];

const zigbee = (
	kind: "zigbee-contact" | "zigbee-valve" | "zigbee-switch" | "zigbee-meter",
	name: string,
	room: string | null,
	address: string,
) =>
	DeviceDTO.upsert({
		homeId,
		kind,
		name,
		roomId: room ? rooms[room] : null,
		externalId: address,
		host: name,
	});
const linky = zigbee("zigbee-meter", "Linky", null, "0x0000000000000001");
const dryer = zigbee("zigbee-switch", "Dryer", "Kitchen", "0x0000000000000002");
demo.push(
	[
		zigbee("zigbee-contact", "Bedroom window", "Bedroom", "0x0000000000000003"),
		{ type: "contact", open: true, battery: 88 },
	],
	[
		zigbee("zigbee-valve", "Bedroom radiator", "Bedroom", "0x0000000000000004"),
		{
			type: "valve",
			target: 5,
			temperature: 18.5,
			battery: 76,
			setpoint: "occupied_heating_setpoint",
			min: 5,
			max: 30,
			heldBy: "Bedroom window",
			heldTarget: 20,
		},
	],
	[
		zigbee("zigbee-valve", "Office radiator", "Office", "0x0000000000000005"),
		{
			type: "valve",
			target: 20.5,
			temperature: 20,
			battery: 91,
			setpoint: "occupied_heating_setpoint",
			min: 5,
			max: 30,
			heldBy: null,
			heldTarget: null,
		},
	],
	[dryer, { type: "switch", on: true, power: 2140, energy: 312.4 }],
	[linky, { type: "meter", power: 3260, energy: 18_240 }],
	[
		DeviceDTO.upsert({
			homeId,
			kind: "dreame-vacuum",
			name: "X30 Ultra",
			roomId: rooms["Living room"],
			externalId: "demo-vacuum",
			host: "10000.mt.eu.iot.dreame.tech:19973",
		}),
		{
			type: "vacuum",
			stage: "docked",
			battery: 100,
			charging: false,
			errorCode: null,
			mode: "both",
			suction: "standard",
			wetness: 16,
			cleanGenius: true,
			lastCleanMinutes: 34,
			lastCleanArea: 21,
			partsLeft: {
				mainBrush: 90,
				sideBrush: 85,
				filter: 81,
				mopPads: 65,
				silverIon: 100,
				detergent: 18,
			},
			dock: {
				cleanWater: "low",
				dirtyWater: "ok",
				dustBag: "ok",
				detergent: "ok",
			},
		},
	],
	[
		DeviceDTO.upsert({
			homeId,
			kind: "app",
			ownerId: "ada",
			name: "Ada's iPhone",
			externalId: "demo-phone",
		}),
		{
			type: "app",
			battery: null,
			charging: null,
			platform: "Safari on iPhone",
			location: {
				latitude: 45.7797,
				longitude: 3.0863,
				accuracy: 20,
				at: new Date().toISOString(),
			},
		},
	],
);
HomeDTO.first().locate({
	place: "Clermont-Ferrand, France",
	latitude: 45.7772,
	longitude: 3.087,
	timezone: "Europe/Paris",
});
const hourMs = 60 * 60_000;
const startHour = Math.floor(Date.now() / hourMs) * hourMs - 400 * 24 * hourMs;
let house = 14_000;
let laundry = 200;
for (let hour = startHour; hour <= Date.now(); hour += hourMs) {
	const date = new Date(hour);
	const winter = Math.cos(((date.getMonth() + 0.5) / 12) * 2 * Math.PI);
	const daytime = date.getHours() >= 7 && date.getHours() <= 22 ? 1.4 : 0.6;
	house +=
		(0.45 + 0.35 * winter) * daytime * (0.8 + ((hour / hourMs) % 7) / 15);
	if (date.getHours() === 19 && date.getDay() % 3 === 0) {
		laundry += 2.6;
	}
	EnergyReadingDTO.record(linky.id, date, Math.round(house * 100) / 100);
	EnergyReadingDTO.record(dryer.id, date, Math.round(laundry * 100) / 100);
}
AutomationDTO.create(homeId, {
	name: "Close the blinds at sunset",
	trigger: { type: "sun", event: "sunset", offsetMinutes: 0 },
	period: { type: "seasons", seasons: ["autumn", "winter"] },
	actions: [{ type: "blinds", roomId: null, move: "close", position: null }],
});
AutomationDTO.create(homeId, {
	name: "Open the blinds at sunrise",
	trigger: { type: "sun", event: "sunrise", offsetMinutes: 15 },
	period: { type: "seasons", seasons: ["autumn", "winter"] },
	actions: [{ type: "blinds", roomId: null, move: "open", position: null }],
});
AutomationDTO.create(homeId, {
	name: "Keep the heat out",
	trigger: { type: "temperature", direction: "above", threshold: 28 },
	period: { type: "dates", from: "06-01", to: "09-15" },
	actions: [
		{
			type: "blinds",
			roomId: rooms.Bedroom ?? null,
			move: "position",
			position: 20,
		},
		{
			type: "blinds",
			roomId: rooms["Living room"] ?? null,
			move: "close",
			position: null,
		},
	],
});
AutomationDTO.create(
	homeId,
	presets["window-valves"].build(
		DeviceDTO.inHome(homeId).map((device) => ({
			id: device.id,
			kind: device.kind,
		})),
	),
);

function showDemoStates(): void {
	for (const [device, state] of demo) {
		device.saveState(state);
	}
}
databaseConnection.close();

process.stdout.write("Starting the server\n");
const server = Bun.spawn([join(root, "build", "server")], {
	cwd: root,
	env: {
		...process.env,
		PORT: String(port),
		ORIGIN: origin,
		AUTH_SECRET: secret,
		DATABASE_PATH: join(work, "localassistant.sqlite"),
		LOG_LEVEL: "warn",
	},
	stdout: "ignore",
	stderr: "inherit",
});

try {
	for (let attempt = 0; ; attempt += 1) {
		const response = await fetch(`${origin}/auth/sign-in`).catch(() => null);
		if (response?.ok) {
			break;
		}
		if (attempt > 60) {
			throw new Error("The server didn't come up");
		}
		await Bun.sleep(500);
	}

	const browser = await chromium.launch();
	const desktop: BrowserContextOptions = {
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		colorScheme: "dark",
		reducedMotion: "reduce",
	};
	const mobile: BrowserContextOptions = {
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		isMobile: true,
		hasTouch: true,
		colorScheme: "light",
		reducedMotion: "reduce",
	};

	async function signedIn(options: BrowserContextOptions): Promise<Page> {
		const context = await browser.newContext(options);
		await context.addInitScript(() =>
			localStorage.setItem("localassistant-install-prompted", "screenshots"),
		);
		const page = await context.newPage();
		await page.goto(`${origin}/auth/sign-in`);
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password", { exact: true }).fill(password);
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		await page.waitForURL(`${origin}/`);
		return page;
	}

	async function shoot(page: Page, name: string): Promise<void> {
		showDemoStates();
		await page.reload();
		await page.waitForLoadState("networkidle");
		await page.addStyleTag({
			content: "[data-sonner-toaster] { display: none !important; }",
		});
		await Bun.sleep(400);
		const png = await page.screenshot();
		await Bun.write(
			join(images, `${name}.webp`),
			await new Image(png).webp({ quality: 90 }).bytes(),
		);
		process.stdout.write(`docs/images/${name}.webp\n`);
	}

	const wide = await signedIn(desktop);
	await shoot(wide, "home-desktop");
	await wide.goto(`${origin}/house`);
	await shoot(wide, "house-desktop");
	await wide.getByRole("button", { name: "Add a room" }).first().click();
	await wide.getByLabel("Name").fill("Terrace");
	await wide.getByRole("radio", { name: "Terrace" }).click();
	await Bun.sleep(400);
	await Bun.write(
		join(images, "room-sheet-desktop.webp"),
		await new Image(await wide.screenshot()).webp({ quality: 90 }).bytes(),
	);
	process.stdout.write("docs/images/room-sheet-desktop.webp\n");
	await wide.keyboard.press("Escape");
	await wide.goto(`${origin}/devices`);
	await shoot(wide, "devices-desktop");
	await wide.getByRole("button", { name: "Add a device" }).last().click();
	await Bun.sleep(400);
	await Bun.write(
		join(images, "add-device-desktop.webp"),
		await new Image(await wide.screenshot()).webp({ quality: 90 }).bytes(),
	);
	process.stdout.write("docs/images/add-device-desktop.webp\n");
	await wide.keyboard.press("Escape");
	await wide.goto(`${origin}/admin/overview`);
	await shoot(wide, "admin-desktop");

	const phone = await signedIn(mobile);
	await shoot(phone, "home-mobile");
	await phone.goto(`${origin}/devices`);
	await shoot(phone, "devices-mobile");
	await phone.getByRole("button", { name: "Add a blind" }).click();
	await phone.getByLabel("Name").fill("Office blind");
	await phone.getByText("Data points").scrollIntoViewIfNeeded();
	await Bun.sleep(400);
	await Bun.write(
		join(images, "add-blind-mobile.webp"),
		await new Image(await phone.screenshot()).webp({ quality: 90 }).bytes(),
	);
	process.stdout.write("docs/images/add-blind-mobile.webp\n");

	await wide.goto(`${origin}/automations`);
	await shoot(wide, "automations-desktop");
	await wide.getByRole("button", { name: "New automation" }).first().click();
	await wide.getByLabel("Name").fill("Hot afternoon");
	await Bun.sleep(400);
	await Bun.write(
		join(images, "automation-sheet-desktop.webp"),
		await new Image(await wide.screenshot()).webp({ quality: 90 }).bytes(),
	);
	process.stdout.write("docs/images/automation-sheet-desktop.webp\n");
	await wide.keyboard.press("Escape");
	await wide.goto(`${origin}/energy`);
	await shoot(wide, "energy-desktop");
	await phone.goto(`${origin}/automations`);
	await shoot(phone, "automations-mobile");
	await phone.goto(`${origin}/energy`);
	await shoot(phone, "energy-mobile");

	for (const [name, width, height] of [
		["panel-tablet", 1180, 820],
		["panel-wall-display", 720, 720],
	] as const) {
		const tablet = await signedIn({
			viewport: { width, height },
			deviceScaleFactor: 2,
			hasTouch: true,
			colorScheme: "dark",
			reducedMotion: "reduce",
		});
		await tablet.goto(`${origin}/panel`);
		await shoot(tablet, name);
	}

	await browser.close();
	for (const [source, target] of [
		["home-mobile", "narrow"],
		["home-desktop", "wide"],
	]) {
		await Bun.write(
			join(root, "static", "screenshots", `${target}.webp`),
			Bun.file(join(images, `${source}.webp`)),
		);
	}
} finally {
	server.kill();
	await server.exited;
	await rm(work, { recursive: true, force: true });
}
