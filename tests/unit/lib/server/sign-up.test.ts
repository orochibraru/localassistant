import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import { JobDTO } from "#lib/dto/job.js";
import { setSetting } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import { authService } from "#lib/server/auth/auth.js";
import { securityPolicy } from "#lib/server/auth/security-policy.js";
import { signUp } from "#lib/server/auth/sign-up.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { user } from "#lib/server/db/schema.js";

import { createUser, resetDatabase } from "../../database.js";

describe("createVerifiedAccount and missingFactors", () => {
	beforeEach(resetDatabase);

	test("creates a verified account through better-auth", async () => {
		await signUp.createVerifiedAccount({
			email: "new@example.com",
			name: "New",
			password: "Correct-Horse-42",
			headers: new Headers({ host: "app.test", origin: "https://app.test" }),
		});
		const created = databaseConnection.get().select().from(user).get();
		expect(created).toMatchObject({
			role: "member",
			email: "new@example.com",
			emailVerified: true,
		});
		expect(UserDTO.count()).toBe(1);
	});

	test("lists the factors an admin requires and the user lacks", () => {
		const ada = createUser("ada");
		expect(securityPolicy.missingFactors(ada)).toEqual([]);
		setSetting("requireTwoFactor", true);
		setSetting("requirePasskey", true);
		expect(securityPolicy.missingFactors(ada)).toEqual([
			"two-factor",
			"passkey",
		]);
		expect(
			securityPolicy.missingFactors({ ...ada, twoFactorEnabled: true }),
		).toEqual(["passkey"]);
	});
});

describe("JobDTO stats", () => {
	beforeEach(resetDatabase);

	test("counts per status and lists failures", () => {
		JobDTO.enqueue("jobs.prune", { olderThanDays: 1 }, { maxAttempts: 1 });
		JobDTO.claimNext()?.fail(new Error("broken"));
		expect(JobDTO.counts()).toEqual({
			pending: 0,
			running: 0,
			done: 0,
			failed: 1,
		});
		expect(JobDTO.recentFailures()[0]).toMatchObject({
			type: "jobs.prune",
			lastError: "broken",
		});
	});
});

describe("forwardAuthLog", () => {
	test("forwards better-auth logs except the base URL warning", () => {
		const output = spyOn(console, "error").mockImplementation(() => {});
		authService.forwardLog("warn", "Base URL is not set");
		authService.forwardLog("error", "Something broke");
		const calls = output.mock.calls.length;
		output.mockRestore();
		expect(calls).toBe(1);
	});
});
