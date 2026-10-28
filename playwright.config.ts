import { defineConfig, devices } from "@playwright/test";

export const e2ePort = 4420;
export const sessionPath = "tmp/e2e/admin.json";

export default defineConfig({
	testDir: "tests/e2e",
	globalSetup: "./tests/e2e/global-setup.ts",
	outputDir: "tmp/e2e/results",
	fullyParallel: false,
	workers: 1,
	forbidOnly: true,
	reporter: [["list"]],
	use: {
		baseURL: `http://localhost:${e2ePort}`,
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "setup",
			testMatch: /setup\.spec\.ts/,
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "desktop",
			testMatch: /desktop\.spec\.ts/,
			dependencies: ["setup"],
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
				storageState: sessionPath,
			},
		},
		{
			name: "phone",
			testMatch: /phone\.spec\.ts/,
			dependencies: ["desktop"],
			use: { ...devices["Pixel 7"], storageState: sessionPath },
		},
	],
});
