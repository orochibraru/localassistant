import { UserDTO } from "#lib/dto/user.js";
import { authService } from "#lib/server/auth/auth.js";

export interface NewAccount {
	email: string;
	name: string;
	password: string;
	headers: Headers;
}

/** Creates the accounts the setup flow and invites hand out; there's no open sign-up. */
class SignUpFlow {
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
