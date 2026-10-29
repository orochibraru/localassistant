import { expect, test } from "@playwright/test";

test("an admin adds a blind and finds it on Home", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("main").getByText("No devices yet"),
	).toBeVisible();
	await page
		.getByRole("main")
		.getByRole("link", { name: "Add devices" })
		.click();
	await expect(page).toHaveURL(/\/devices$/);

	await page.getByRole("button", { name: /Tuya blinds/ }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByLabel("Name").fill("Office blind");
	await sheet.getByLabel("IP address").fill("127.0.0.1");
	await sheet.getByLabel("Device ID").fill("bfabcdabcdabcdabcdgh");
	await sheet.getByLabel("Local key").fill("abcdabcdabcdabcd");
	await sheet.getByRole("button", { name: "Add the blind" }).click();
	await expect(page.getByText("Added. It's read in a moment.")).toBeVisible();
	await expect(page.getByRole("main").getByText("Office blind")).toBeVisible();

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

test("the Integrations tab lists the official plugins and explains a bad link", async ({
	page,
}) => {
	await page.goto("/admin/plugins");
	await expect(
		page.getByRole("heading", { name: "Tuya blinds" }),
	).toBeVisible();
	await expect(page.getByText("Official").first()).toBeVisible();
	await page.getByLabel("Link").fill("not a link");
	await page.getByRole("button", { name: "Look it up" }).click();
	await expect(
		page.getByText(/isn't a link to a repository or a folder/),
	).toBeVisible();
});

test("a dashboard is made with a heading and the weather, then shows on Home", async ({
	page,
}) => {
	await page.goto("/dashboards");
	await expect(page.getByText("No dashboard yet")).toBeVisible();
	await page.getByRole("button", { name: "New dashboard" }).first().click();
	const sheet = page.getByRole("dialog").last();
	await sheet.getByLabel("Name").fill("Evening");
	await sheet.getByRole("button", { name: "Take it out" }).click();
	await sheet.getByRole("button", { name: "Add", exact: true }).click();
	await page.getByRole("menuitem", { name: "Heading" }).click();
	await sheet.getByLabel("Heading").fill("Living room");
	await sheet.getByRole("button", { name: "Add", exact: true }).click();
	await page.getByRole("menuitem", { name: "Weather" }).click();
	await sheet.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Evening saved.")).toBeVisible();
	await page.getByRole("link", { name: /Evening/ }).click();
	await expect(page.getByText("Living room")).toBeVisible();
	await page.goto("/");
	await expect(page.getByRole("link", { name: "Evening" })).toBeVisible();
});
