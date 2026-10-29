import { defineEnvVars } from "@sveltejs/kit/env";
import { z } from "zod";

const optionalText = z
	.string()
	.optional()
	.transform((value) => value?.trim() || undefined);

function integer(fallback: number, minimum: number, maximum: number) {
	return z
		.string()
		.optional()
		.transform((value) => (value?.trim() ? Number(value) : fallback))
		.pipe(z.number().int().min(minimum).max(maximum));
}

const optionalUrl = optionalText.pipe(
	z.url({ protocol: /^https?$/ }).optional(),
);

const signInMethodNames = [
	"password",
	"passkey",
	"magic-link",
	"email-code",
] as const;

export const variables = defineEnvVars({
	AUTH_SECRET: {
		schema: z
			.string()
			.min(
				32,
				"AUTH_SECRET must be at least 32 characters: generate one with `openssl rand -base64 32`",
			),
		description:
			"Signs sessions and encrypts stored secrets. Changing it signs everyone out and loses stored secrets.",
	},
	ORIGIN: {
		schema: optionalUrl,
		description:
			"Public URL, only for an instance with no HTTPS proxy setting X-Forwarded-Proto and X-Forwarded-Host.",
	},
	SIGN_IN_METHODS: {
		schema: optionalText.pipe(
			z
				.string()
				.transform((value) => value.split(",").map((name) => name.trim()))
				.pipe(
					z
						.array(z.enum(signInMethodNames))
						.min(1, "List at least one method."),
				)
				.optional(),
		),
		description:
			"Sign-in methods to allow whatever the admin settings say, comma-separated: password, passkey, magic-link, email-code. Set it to get back in after locking yourself out, then remove it.",
	},
	DATABASE_PATH: {
		schema: z.string().trim().min(1).default("./data/localassistant.sqlite"),
		description: "The SQLite file.",
	},
	LOG_LEVEL: {
		schema: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
		description: "Lowest level written to the log.",
	},
	LOG_FORMAT: {
		schema: z.enum(["console", "json"]).default("console"),
		description:
			"Coloured lines for a terminal by default; json opts in to one JSON object per line for a log shipper.",
	},
	WORKER_CONCURRENCY: {
		schema: integer(2, 1, 32),
		description: "Background jobs run at once.",
	},
	WORKER_POLL_INTERVAL_MS: {
		schema: integer(1000, 100, 60_000),
		description: "How often the worker looks for due jobs.",
	},
	APP_VERSION: {
		schema: optionalText,
		description: "Version shown in the footer; package.json's when unset.",
	},
});
