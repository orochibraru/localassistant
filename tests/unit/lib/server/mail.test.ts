import { beforeEach, describe, expect, mock, test } from "bun:test";

import { setSetting } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";
import { emails } from "#lib/server/notifications/emails.js";

import { resetDatabase } from "../../database.js";

const sendMail = mock(async (_message: unknown) => ({}));
mock.module("nodemailer", () => ({ createTransport: () => ({ sendMail }) }));

const { mailer } = await import("#lib/server/notifications/mailer.js");

describe("emails", () => {
	test("templates escape names and carry the code or link", () => {
		const invite = emails.invite(
			"a@b.c",
			"https://app.test/auth/invite/x",
			"<Ada>",
		);
		expect(invite.html).toContain("&lt;Ada&gt;");
		expect(invite.text).toContain("https://app.test/auth/invite/x");
		expect(emails.test("a@b.c").to).toBe("a@b.c");
	});

	test("account emails carry the reset link, the code or the new address", () => {
		expect(emails.resetPassword("a@b.c", "https://app.test/r").text).toContain(
			"https://app.test/r",
		);
		expect(emails.emailChangeCode("new@b.c", "654321").subject).toContain(
			"654 321",
		);
		const changed = emails.emailChanged("old@b.c", "<new@b.c>");
		expect(changed.to).toBe("old@b.c");
		expect(changed.html).toContain("&lt;new@b.c&gt;");
	});
});

describe("mailer", () => {
	beforeEach(resetDatabase);

	test("refuses to send without SMTP, then sends through the transport", async () => {
		expect(mailer.isConfigured()).toBe(false);
		expect(mailer.deliver(emails.test("a@b.c"))).rejects.toThrow(
			"No SMTP server",
		);
		setSetting("smtp", {
			host: "smtp.example.com",
			port: 465,
			security: "tls",
			username: "user",
			encryptedPassword: secrets.encrypt("secret"),
			fromAddress: "localassistant@example.com",
			fromName: "LocalAssistant",
		});
		await jobHandlers["email.send"](emails.test("a@b.c"));
		expect(sendMail).toHaveBeenCalledTimes(1);
	});
});

describe("mailer errors", () => {
	beforeEach(resetDatabase);

	const smtp = {
		host: "smtp.example.com",
		port: 465,
		security: "tls" as const,
		username: "user",
		encryptedPassword: "",
		fromAddress: "localassistant@example.com",
		fromName: "LocalAssistant",
	};

	test("a refused send throws the reason in plain words", async () => {
		setSetting("smtp", { ...smtp, encryptedPassword: secrets.encrypt("x") });
		sendMail.mockImplementationOnce(() =>
			Promise.reject(
				Object.assign(new Error("Invalid login"), { code: "EAUTH" }),
			),
		);
		expect(mailer.deliver(emails.test("a@b.c"))).rejects.toThrow(
			"refused the username and password",
		);
	});

	test("explains TLS mismatches, timeouts, unknown hosts and refusals", () => {
		expect(
			mailer.explain(new Error("ssl3_get_record:wrong version number"), smtp),
		).toContain("Port 465 uses TLS");
		expect(mailer.explain({ code: "ETIMEDOUT" }, smtp)).toContain(
			"didn't answer on port 465",
		);
		expect(mailer.explain({ code: "EDNS" }, smtp)).toContain(
			"couldn't be found",
		);
		expect(
			mailer.explain({ responseCode: 550, response: "550 no such user" }, smtp),
		).toContain("sender or recipient");
		expect(mailer.explain({ response: "421 busy" }, smtp)).toBe(
			"The SMTP server refused the email: 421 busy",
		);
		expect(mailer.explain(null, smtp)).toBe(
			"The SMTP server refused the email.",
		);
	});
});
