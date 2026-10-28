import { expect, test } from "@playwright/test";

import { sessionPath } from "../../playwright.config.js";

test("the first visitor sets up the admin account", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveURL(/\/auth\/setup/);
	await page
		.getByLabel("Setup code")
		.fill(await Bun.file("tmp/e2e/setup-code.txt").text());
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByLabel("Email").fill("ada@example.com");
	await page.getByLabel("Your name").fill("Ada");
	await page
		.getByLabel("Password", { exact: true })
		.fill("Correct-Horse-Battery-9");
	await page.getByLabel("Type it again").fill("Correct-Horse-Battery-9");
	await page.getByRole("button", { name: "Create the admin account" }).click();
	await expect(page).toHaveURL(/\/admin\/overview/);
	await page.context().storageState({ path: sessionPath });
});
