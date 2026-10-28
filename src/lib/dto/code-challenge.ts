import { eq } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { secrets } from "#lib/server/core/secrets.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { verification } from "#lib/server/db/schema.js";

type VerificationRow = typeof verification.$inferSelect;

interface ChallengeValue {
	codeHash: string;
	attempts: number;
}

const lifetimeMs = 15 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const maxAttempts = 5;

export class CodeChallengeDTO extends BaseDTO<VerificationRow> {
	/**
	 * Starts a 6-digit code challenge for `identifier` (like `signup:<email>` or `setup`) and returns the code to deliver.
	 *
	 * @throws When a code for that identifier was issued less than a minute ago.
	 */
	static start(identifier: string, code = secrets.randomCode()): string {
		const existing = CodeChallengeDTO.find(identifier, {
			includeExpired: true,
		});
		if (
			existing &&
			Date.now() - existing.row.createdAt.getTime() < resendCooldownMs
		) {
			throw new Error(
				"A code was just sent. Wait a minute before asking for another.",
			);
		}
		const database = databaseConnection.get();
		database
			.delete(verification)
			.where(eq(verification.identifier, identifier))
			.run();
		const value: ChallengeValue = {
			codeHash: secrets.hashToken(code),
			attempts: 0,
		};
		database
			.insert(verification)
			.values({
				id: crypto.randomUUID(),
				identifier,
				value: JSON.stringify(value),
				expiresAt: new Date(Date.now() + lifetimeMs),
			})
			.run();
		return code;
	}

	/** The live challenge for `identifier`, if any. */
	static find(
		identifier: string,
		{ includeExpired = false } = {},
	): CodeChallengeDTO | undefined {
		const row = databaseConnection
			.get()
			.select()
			.from(verification)
			.where(eq(verification.identifier, identifier))
			.get();
		if (!row || (!includeExpired && row.expiresAt.getTime() < Date.now())) {
			return undefined;
		}
		return new CodeChallengeDTO(row);
	}

	/** Checks `code`: the challenge is consumed on success and dropped after too many wrong tries. */
	verify(code: string): boolean {
		const database = databaseConnection.get();
		const value = JSON.parse(this.row.value) as ChallengeValue;
		if (value.codeHash === secrets.hashToken(code)) {
			database
				.delete(verification)
				.where(eq(verification.id, this.row.id))
				.run();
			return true;
		}
		const attempts = value.attempts + 1;
		if (attempts >= maxAttempts) {
			database
				.delete(verification)
				.where(eq(verification.id, this.row.id))
				.run();
		} else {
			database
				.update(verification)
				.set({ value: JSON.stringify({ ...value, attempts }) })
				.where(eq(verification.id, this.row.id))
				.run();
		}
		return false;
	}
}
