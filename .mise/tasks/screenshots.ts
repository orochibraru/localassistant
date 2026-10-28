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

import type { DeviceState } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
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

const demo: [DeviceDTO, DeviceState][] = [
	[
		DeviceDTO.upsert({
			kind: "melcloud-ata",
			name: "Living room",
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
			kind: "melcloud-ata",
			name: "Bedroom",
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
	...(
		[
			["Living room blind", 100],
			["Kitchen blind", 40],
			["Bedroom blind", 0],
		] as const
	).map(([name, position], index): [DeviceDTO, DeviceState] => [
		DeviceDTO.upsert({
			kind: "tuya-cover",
			name,
			externalId: `bfdemo00000000000${index}`,
			host: `192.0.2.${10 + index}`,
			protocolVersion: "3.3",
			encryptedLocalKey: secrets.encrypt("abcdabcdabcdabcd"),
		}),
		{ type: "cover", position },
	]),
];

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
	await wide.goto(`${origin}/admin/devices`);
	await shoot(wide, "devices-desktop");
	await wide.goto(`${origin}/admin/overview`);
	await shoot(wide, "admin-desktop");

	const phone = await signedIn(mobile);
	await shoot(phone, "home-mobile");
	await phone.goto(`${origin}/admin/devices`);
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
