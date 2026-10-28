import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import { JobDTO } from "#lib/dto/job.js";
import { setSetting } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import { authService } from "#lib/server/auth/auth.js";
import { securityPolicy } from "#lib/server/auth/security-policy.js";
import { signUp, SignUpError } from "#lib/server/auth/sign-up.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { job, user } from "#lib/server/db/schema.js";

import { createUser, resetDatabase } from "../../database.js";

const signInLink = "https://app.test/auth/sign-in";

const smtp = {
	host: "smtp.example.com",
	port: 587,
	security: "starttls" as const,
	username: "",
	encryptedPassword: "",
	fromAddress: "localassistant@example.com",
	fromName: "LocalAssistant",
};

describe("startSignUp", () => {
	beforeEach(resetDatabase);

	test("is closed while sign-ups are off", () => {
		expect(() => signUp.start("someone@example.com", signInLink)).toThrow(
			SignUpError,
		);
		expect(() => signUp.start("someone@example.com", signInLink)).toThrow(
			"invite",
		);
	});

	test("open sign-ups still need SMTP, then email the code", () => {
		setSetting("signUpsEnabled", true);
		expect(() => signUp.start("someone@example.com", signInLink)).toThrow(
			"email delivery",
		);
		setSetting("smtp", smtp);
		signUp.start("someone@example.com", signInLink);
		expect(
			databaseConnection.get().select({ type: job.type }).from(job).all(),
		).toEqual([{ type: "email.send" }]);
		expect(() => signUp.start("someone@example.com", signInLink)).toThrow(
			"Wait a minute",
		);
	});

	test("answers a taken address like a new one, mailing its owner a sign-in link instead of a code", () => {
		createUser("ada");
		expect(() => signUp.start("ada@example.com", signInLink)).toThrow("invite");
		setSetting("signUpsEnabled", true);
		setSetting("smtp", smtp);
		signUp.start("ada@example.com", signInLink);
		const [queued] = databaseConnection
			.get()
			.select({ payload: job.payload })
			.from(job)
			.all();
		expect(JSON.stringify(queued?.payload)).toContain(
			"You already have an LocalAssistant account",
		);
	});
});

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
