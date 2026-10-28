import { z } from "zod";

import { passwordMaxLength, passwordRules } from "#lib/password-policy.js";

export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email("Enter a valid email."));

export const signInSchema = z.object({
	email: emailSchema,
	password: z.string().min(1, "Enter your password.").max(passwordMaxLength),
});

export const signUpStartSchema = z.object({ email: emailSchema });

export const codeSchema = z.object({
	code: z
		.string()
		.trim()
		.regex(/^\d{3}[- ]?\d{3}$/, "Enter the 6-digit code.")
		.transform((code) => code.replace(/[- ]/, "")),
});

function checkNewPassword(email: string) {
	return (
		value: { password: string; confirmPassword: string },
		context: z.core.$RefinementCtx,
	) => {
		for (const rule of passwordRules(value.password, email)) {
			if (!rule.passed) {
				context.addIssue({
					code: "custom",
					path: ["password"],
					message: `${rule.label}.`,
				});
			}
		}
		if (value.password !== value.confirmPassword) {
			context.addIssue({
				code: "custom",
				path: ["confirmPassword"],
				message: "The passwords don't match.",
			});
		}
	};
}

/** Name, password and its confirmation for a new account whose address is `email`. */
export function newAccountSchema(email: string) {
	return z
		.object({
			name: z
				.string()
				.trim()
				.min(1, "Enter your name.")
				.max(80, "Keep it under 80 characters."),
			password: z.string(),
			confirmPassword: z.string(),
		})
		.superRefine(checkNewPassword(email));
}

/** A new password and its confirmation for the account whose address is `email`. */
export function newPasswordSchema(email: string) {
	return z
		.object({ password: z.string(), confirmPassword: z.string() })
		.superRefine(checkNewPassword(email));
}

/** The current password, when the account has one, then a new one typed twice. */
export function changePasswordSchema(email: string) {
	return z
		.object({
			currentPassword: z.string().max(passwordMaxLength).default(""),
			password: z.string(),
			confirmPassword: z.string(),
		})
		.superRefine(checkNewPassword(email));
}

export const emailChangeSchema = z.object({ email: emailSchema });

export const emailChangeCodeSchema = z.object({
	email: emailSchema,
	code: codeSchema.shape.code,
});

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const totpSchema = z.object({
	code: z
		.string()
		.trim()
		.regex(/^\d{6}$/, "Enter the 6-digit code from your app."),
	trustDevice: z.stringbool().optional(),
});

export const backupCodeSchema = z.object({
	code: z.string().trim().min(1, "Enter a backup code."),
	trustDevice: z.stringbool().optional(),
});

export const passwordConfirmSchema = z.object({
	password: z.string().min(1, "Enter your password.").max(passwordMaxLength),
});

export const optionalPasswordSchema = z.object({
	password: z.string().max(passwordMaxLength).default(""),
});

export const emailSignInSchema = z.object({ email: emailSchema });

export const emailCodeSignInSchema = z.object({
	email: emailSchema,
	code: codeSchema.shape.code,
});
