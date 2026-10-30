import { and, eq, gt } from "drizzle-orm";

import { secrets } from "#lib/server/core/secrets.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { verification } from "#lib/server/db/schema.js";

export const mobileCodeKinds = ["sign-in", "pair"] as const;
export type MobileCodeKind = (typeof mobileCodeKinds)[number];

/** Single-use codes that sign the mobile app in, kept hashed among better-auth's verifications; only finders. */
export class MobileCodeDTO {
	/** Issues a code of `kind` carrying `value`, valid for `lifetimeMs`; returns the code to hand over. */
	static issue(
		kind: MobileCodeKind,
		value: string,
		lifetimeMs: number,
	): string {
		const code = secrets.randomToken();
		databaseConnection
			.get()
			.insert(verification)
			.values({
				id: crypto.randomUUID(),
				identifier: `mobile-${kind}:${secrets.hashToken(code)}`,
				value,
				expiresAt: new Date(Date.now() + lifetimeMs),
			})
			.run();
		return code;
	}

	/** Consumes the live code of `kind` and returns what it carried, or `null`; a code answers once. */
	static redeem(kind: MobileCodeKind, code: string): string | null {
		const row = databaseConnection
			.get()
			.delete(verification)
			.where(
				and(
					eq(
						verification.identifier,
						`mobile-${kind}:${secrets.hashToken(code)}`,
					),
					gt(verification.expiresAt, new Date()),
				),
			)
			.returning({ value: verification.value })
			.get();
		return row?.value ?? null;
	}
}
