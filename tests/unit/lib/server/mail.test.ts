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
