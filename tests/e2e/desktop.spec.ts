import { expect, test } from "@playwright/test";

test("an admin adds a blind and finds it on Home", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByText("No devices yet")).toBeVisible();
	await page.getByRole("link", { name: "Add devices" }).click();
	await expect(page).toHaveURL(/\/admin\/devices/);

	await page.getByRole("button", { name: "Add a blind" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByLabel("Name").fill("Office blind");
	await sheet.getByLabel("IP address").fill("127.0.0.1");
	await sheet.getByLabel("Device ID").fill("bfabcdabcdabcdabcdgh");
	await sheet.getByLabel("Local key").fill("abcdabcdabcdabcd");
	await sheet.getByRole("button", { name: "Add blind" }).click();
	await expect(page.getByText("Blind added.")).toBeVisible();
	await expect(page.getByText("Office blind")).toBeVisible();

	await page.getByRole("link", { name: "Home" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Office blind" }),
	).toBeVisible();
	const card = page.getByRole("article").filter({ hasText: "Office blind" });
	await page.getByRole("button", { name: "Open Office blind" }).click();
	await expect(card.getByText("Opening")).toBeVisible();
	await expect(card.locator(".text-destructive")).toBeVisible({
		timeout: 15_000,
	});
	await expect(card.getByText("Opening")).toHaveCount(0);
	await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});
