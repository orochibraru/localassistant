import { CodeChallengeDTO } from "#lib/dto/code-challenge.js";
import { getSetting } from "#lib/dto/setting.js";
import { UserDTO } from "#lib/dto/user.js";
import { authService } from "#lib/server/auth/auth.js";
import { emails } from "#lib/server/notifications/emails.js";
import { mailer } from "#lib/server/notifications/mailer.js";

export class SignUpError extends Error {}

export interface NewAccount {
	email: string;
	name: string;
	password: string;
	headers: Headers;
}

/** The sign-up stepper's server side: the emailed code, then the verified account. */
class SignUpFlow {
	/** The challenge identifier of a sign-up for `email`. */
	identifier(email: string): string {
		return `signup:${email}`;
	}

	/**
	 * Starts a sign-up for `email`: checks sign-ups are open and email works, then emails a verification code, or a note
	 * to sign in instead when the address already has an account, so the answer never tells whether it does.
	 *
	 * @throws SignUpError when sign-ups are closed, email isn't set up, or a code was sent less than a minute ago.
	 */
	start(email: string, signInLink: string): void {
		if (!getSetting("signUpsEnabled")) {
			throw new SignUpError("Sign-ups are closed. Ask an admin for an invite.");
		}
		if (!mailer.isConfigured()) {
			throw new SignUpError(
				"Sign-ups need email delivery, which isn't set up yet. Ask an admin.",
			);
		}
		let code: string;
		try {
			code = CodeChallengeDTO.start(this.identifier(email));
		} catch (error) {
			throw new SignUpError(
				error instanceof Error ? error.message : String(error),
			);
		}
		emails.queue(
			UserDTO.emailExists(email)
				? emails.accountExists(email, signInLink)
				: emails.verificationCode(email, code),
		);
	}

	/** Creates a verified account, signs it in on the current request and returns its id. */
	async createVerifiedAccount({
		email,
		name,
		password,
		headers,
	}: NewAccount): Promise<string> {
		const result = await authService.get().api.signUpEmail({
			body: { email, name, password },
			headers,
		});
		UserDTO.markEmailVerified(result.user.id);
		return result.user.id;
	}
}

export const signUp = new SignUpFlow();
