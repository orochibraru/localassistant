import { expect, test } from "@playwright/test";

test("Home fits a phone and the blind drawer opens", async ({ page }) => {
	await page.addInitScript(() =>
		localStorage.setItem("localassistant-install-prompted", "e2e"),
	);
	await page.goto("/devices");
	await page.getByRole("button", { name: /Tuya blinds/ }).click();
	const sheet = page.getByRole("dialog").last();
	await expect(sheet.getByLabel("Local key")).toBeVisible();
	await page.keyboard.press("Escape");

	await page.goto("/");
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth,
	);
	expect(overflow).toBeLessThanOrEqual(0);
});

test("the app links an installable manifest", async ({ page, request }) => {
	await page.goto("/");
	const href = await page.locator('link[rel="manifest"]').getAttribute("href");
	expect(href).toBeTruthy();
	const manifest = await request.get(new URL(href ?? "", page.url()).href);
	expect(manifest.ok()).toBe(true);
	const body = await manifest.json();
	expect(body.display).toBe("standalone");
	expect(
		body.icons.some((icon: { sizes: string }) => icon.sizes === "512x512"),
	).toBe(true);
});

test("a phone is offered the install once", async ({ page }) => {
	await page.goto("/");
	const prompt = page.getByRole("dialog", { name: "Install LocalAssistant" });
	await expect(prompt).toBeVisible({ timeout: 10_000 });
	await prompt.getByRole("button", { name: /Got it|Not now/ }).click();
	await expect(prompt).toBeHidden();
	expect(
		await page.evaluate(() =>
			localStorage.getItem("localassistant-install-prompted"),
		),
	).not.toBeNull();
});

test("automations open their editor and the wall panel fits a square screen", async ({
	page,
}) => {
	await page.addInitScript(() =>
		localStorage.setItem("localassistant-install-prompted", "e2e"),
	);
	await page.goto("/automations");
	await page.getByRole("link", { name: /Scenes/ }).click();
	await expect(page.getByText("No scene yet")).toBeVisible();
	await page.goto("/automations/routines");
	await expect(page.getByText("No routine yet")).toBeVisible();
	await page.getByRole("button", { name: "New routine" }).last().click();
	const sheet = page.getByRole("dialog").last();
	await sheet.getByLabel("Start from").click();
	await expect(
		page.getByText("Radiators off while a window is open"),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(sheet.getByRole("radio", { name: "Sunset" })).toBeVisible();
	await expect(
		sheet.getByText("Weather", { exact: true }).first(),
	).toBeVisible();
	await sheet.screenshot({ path: "tmp/e2e/routine-phone.png" });
	await expect(sheet.getByLabel("Name")).toHaveAttribute("data-1p-ignore", "");
	await expect(sheet.getByLabel("Name")).toHaveAttribute("autocomplete", "off");
	await page.keyboard.press("Escape");

	await page.setViewportSize({ width: 720, height: 720 });
	await page.goto("/panel");
	await expect(
		page.getByRole("button", { name: "Leave the panel" }),
	).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth,
	);
	expect(overflow).toBeLessThanOrEqual(0);
});

test("the assistant takes the whole screen, without the tab bar", async ({
	page,
}) => {
	await page.addInitScript(() =>
		localStorage.setItem("localassistant-install-prompted", "e2e"),
	);
	await page.goto("/assistant");
	await expect(
		page.getByRole("heading", { name: "The assistant is off" }),
	).toBeVisible();
	await expect(page.getByRole("link", { name: "Back to Home" })).toBeVisible();
	await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
	await page.screenshot({ path: "tmp/e2e/assistant-phone.png" });
});
