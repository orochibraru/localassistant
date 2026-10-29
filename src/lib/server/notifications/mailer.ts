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
	 * @throws When no SMTP server is configured, or with a reason a person can act on when the server can't be reached
	 *   or refuses the message.
	 */
	async deliver(message: EmailMessage): Promise<void> {
		const smtp = getSetting("smtp");
		if (!smtp) {
			throw new Error("No SMTP server is configured");
		}
		try {
			await this.#transport(smtp).sendMail({
				from: { name: smtp.fromName, address: smtp.fromAddress },
				to: message.to,
				subject: message.subject,
				text: message.text,
				html: message.html,
			});
		} catch (error) {
			throw new Error(this.explain(error, smtp), { cause: error });
		}
	}

	/** Why sending failed, in words that point at the setting to fix, from what nodemailer threw. */
	explain(error: unknown, smtp: SmtpSettings): string {
		const failure = (error ?? {}) as {
			code?: string;
			responseCode?: number;
			response?: string;
			message?: string;
		};
		const detail = failure.response ?? failure.message ?? "";
		if (failure.code === "EAUTH" || failure.responseCode === 535) {
			return "The SMTP server refused the username and password.";
		}
		if (/wrong version number|ssl3_get_record|tls/i.test(detail)) {
			return `The SMTP server didn't speak ${smtp.security === "tls" ? "TLS" : "plain SMTP"} on port ${smtp.port}. Port 465 uses TLS, 587 uses STARTTLS.`;
		}
		if (failure.code === "ETIMEDOUT" || failure.code === "ECONNECTION") {
			return `${smtp.host} didn't answer on port ${smtp.port}. Check the host, the port and that this server may reach it.`;
		}
		if (failure.code === "EDNS" || /ENOTFOUND|EAI_AGAIN/.test(detail)) {
			return `${smtp.host} couldn't be found. Check the host name.`;
		}
		if (failure.code === "EENVELOPE" || failure.responseCode === 550) {
			return `The SMTP server refused the sender or recipient: ${detail}`;
		}
		return detail
			? `The SMTP server refused the email: ${detail}`
			: "The SMTP server refused the email.";
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
