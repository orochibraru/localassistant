import { z } from "zod";

export type FieldErrors = Record<string, string[]>;

export type ParsedForm<Output> =
	{ success: true; data: Output } | { success: false; errors: FieldErrors };

/** Validates a submitted form against `schema`, returning the parsed data or the error messages per field. */
export function parseForm<Schema extends z.ZodType>(
	schema: Schema,
	formData: FormData,
): ParsedForm<z.infer<Schema>> {
	const result = schema.safeParse(Object.fromEntries(formData));
	if (result.success) {
		return { success: true, data: result.data };
	}
	const errors: FieldErrors = {};
	for (const issue of result.error.issues) {
		const field = String(issue.path[0] ?? "form");
		errors[field] = [...(errors[field] ?? []), issue.message];
	}
	return { success: false, errors };
}

export const idSchema = z.object({ id: z.string().trim().min(1) });
