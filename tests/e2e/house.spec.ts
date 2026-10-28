import { expect, test } from "@playwright/test";

test("lay out a floor and a room whose icon follows its name", async ({
	page,
}) => {
	await page.goto("/house");
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	await sidebar.getByRole("button", { name: "Add to the house" }).click();
	await page.getByRole("menuitem", { name: "Add a floor" }).click();
	const floorSheet = page.getByRole("dialog");
	await floorSheet.getByLabel("Name").fill("Rez-de-chaussée");
	await floorSheet.getByRole("button", { name: "Add floor" }).click();
	await expect(page.getByText("Floor added.")).toBeVisible();
	await expect(
		page.getByRole("main").getByRole("heading", { name: "Rez-de-chaussée" }),
	).toBeVisible();

	await sidebar.getByRole("button", { name: "Add to the house" }).click();
	await page.getByRole("menuitem", { name: "Add a room" }).click();
	const roomSheet = page.getByRole("dialog");
	await roomSheet.getByLabel("Name").fill("Atelier");
	await expect(
		roomSheet.getByRole("radio", { name: "Workshop" }),
	).toHaveAttribute("data-state", "on");
	await roomSheet.getByLabel("Name").fill("Cuisine");
	await expect(
		roomSheet.getByRole("radio", { name: "Kitchen" }),
	).toHaveAttribute("data-state", "on");
	await roomSheet.getByRole("radio", { name: "Lounge" }).click();
	await roomSheet.getByLabel("Name").fill("Cuisine d'été");
	await expect(
		roomSheet.getByRole("radio", { name: "Lounge" }),
	).toHaveAttribute("data-state", "on");
	await roomSheet.getByRole("button", { name: "Add room" }).click();
	await expect(page.getByText("Room added.")).toBeVisible();
	await expect(
		sidebar.getByRole("link", { name: "Cuisine d'été" }),
	).toBeVisible();
});
