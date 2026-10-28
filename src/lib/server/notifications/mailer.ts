import { createTransport } from "nodemailer";

import { getSetting, type SmtpSettings } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";

export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
	html: string;
}

/** Sends email through the SMTP server an admin configured. */
class Mailer {
	/** Whether an admin configured an SMTP server. */
	isConfigured(): boolean {
		return getSetting("smtp") !== null;
	}

	/**
	 * Sends `message` through the configured SMTP server.
	 *
	 * @throws When no SMTP server is configured or the server refuses the message.
	 */
	async deliver(message: EmailMessage): Promise<void> {
		const smtp = getSetting("smtp");
		if (!smtp) {
			throw new Error("No SMTP server is configured");
		}
		await this.#transport(smtp).sendMail({
			from: { name: smtp.fromName, address: smtp.fromAddress },
			to: message.to,
			subject: message.subject,
			text: message.text,
			html: message.html,
		});
	}

	/** A nodemailer transport for `smtp`, with its password decrypted and short timeouts. */
	#transport(smtp: SmtpSettings) {
		return createTransport({
			host: smtp.host,
			port: smtp.port,
			secure: smtp.security === "tls",
			requireTLS: smtp.security === "starttls",
			ignoreTLS: smtp.security === "none",
			auth: smtp.username
				? { user: smtp.username, pass: secrets.decrypt(smtp.encryptedPassword) }
				: undefined,
			connectionTimeout: 15_000,
			greetingTimeout: 15_000,
			socketTimeout: 30_000,
		});
	}
}

export const mailer = new Mailer();
