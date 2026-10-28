import { describe, expect, test } from "bun:test";

import {
	changePasswordSchema,
	codeSchema,
	newAccountSchema,
	newPasswordSchema,
	signInSchema,
} from "#lib/server/validation/auth.js";
import {
	climateChangeSchema,
	editTuyaCoverSchema,
	tuyaCoverSchema,
} from "#lib/server/validation/device.js";
import { parseForm } from "#lib/server/validation/form.js";

function form(fields: Record<string, string>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		data.set(key, value);
	}
	return data;
}

describe("parseForm", () => {
	test("returns trimmed, normalised data", () => {
		expect(
			parseForm(
				signInSchema,
				form({ email: " Ada@Example.com ", password: "x" }),
			),
		).toEqual({
			success: true,
			data: { email: "ada@example.com", password: "x" },
		});
	});

	test("groups messages per field", () => {
		const parsed = parseForm(
			newAccountSchema("ada@example.com"),
			form({ name: "", password: "short", confirmPassword: "other" }),
		);
		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(Object.keys(parsed.errors).sort()).toEqual([
				"confirmPassword",
				"name",
				"password",
			]);
		}
	});

	test("accepts a strong, confirmed password", () => {
		const password = "Correct-Horse-42";
		expect(
			parseForm(
				newAccountSchema("ada@example.com"),
				form({ name: "Ada", password, confirmPassword: password }),
			).success,
		).toBe(true);
	});

	test("normalises a code typed with a dash", () => {
		expect(parseForm(codeSchema, form({ code: "123-456" }))).toEqual({
			success: true,
			data: { code: "123456" },
		});
		expect(parseForm(codeSchema, form({ code: "123 456" }))).toEqual({
			success: true,
			data: { code: "123456" },
		});
	});

	test("editing a blind keeps its local key when the field is left empty", () => {
		const fields = {
			id: "blind",
			name: "Office",
			host: "192.168.1.41",
			protocolVersion: "3.4" as const,
		};
		expect(parseForm(editTuyaCoverSchema, form(fields))).toEqual({
			success: true,
			data: {
				...fields,
				inverted: false,
				localKey: undefined,
				controlDp: 1,
				positionDp: 2,
				positionStateDp: 3,
			},
		});
		expect(
			parseForm(editTuyaCoverSchema, form({ ...fields, localKey: "short" }))
				.success,
		).toBe(false);
		const custom = parseForm(
			editTuyaCoverSchema,
			form({ ...fields, controlDp: "101", positionDp: "0" }),
		);
		expect(custom.success || Object.keys(custom.errors)).toEqual([
			"positionDp",
		]);
	});

	test("a heat pump change says what to change", () => {
		expect(
			climateChangeSchema.safeParse({ deviceId: "a", power: true }).success,
		).toBe(true);
		expect(climateChangeSchema.safeParse({ deviceId: "a" }).success).toBe(
			false,
		);
		expect(
			climateChangeSchema.safeParse({ deviceId: "a", hotWaterBoost: true })
				.success,
		).toBe(true);
	});

	test("a Tuya blind needs an address, its ID and its local key", () => {
		expect(
			parseForm(
				tuyaCoverSchema,
				form({
					name: "Living room",
					host: "192.168.1.40",
					externalId: "bf1234567890abcdefgh",
					localKey: "abcdabcdabcdabcd",
				}),
			),
		).toEqual({
			success: true,
			data: {
				name: "Living room",
				host: "192.168.1.40",
				externalId: "bf1234567890abcdefgh",
				localKey: "abcdabcdabcdabcd",
				protocolVersion: "3.3",
				inverted: false,
				controlDp: 1,
				positionDp: 2,
				positionStateDp: 3,
			},
		});
		const parsed = parseForm(
			tuyaCoverSchema,
			form({ name: "", host: "", externalId: "x", localKey: "short" }),
		);
		expect(parsed.success || Object.keys(parsed.errors).sort()).toEqual([
			"externalId",
			"host",
			"localKey",
			"name",
		]);
	});
});

describe("password change schemas", () => {
	test("newPasswordSchema applies the rules and wants it twice", () => {
		expect(
			parseForm(
				newPasswordSchema("ada@example.com"),
				form({
					password: "Correct-Horse-9",
					confirmPassword: "Correct-Horse-9",
				}),
			).success,
		).toBe(true);
		const parsed = parseForm(
			newPasswordSchema("ada@example.com"),
			form({ password: "ada-Is-Great-99", confirmPassword: "other" }),
		);
		expect(parsed.success || Object.keys(parsed.errors).sort()).toEqual([
			"confirmPassword",
			"password",
		]);
	});

	test("changePasswordSchema takes the current password when there is one", () => {
		expect(
			parseForm(
				changePasswordSchema("ada@example.com"),
				form({
					currentPassword: "old",
					password: "Correct-Horse-9",
					confirmPassword: "Correct-Horse-9",
				}),
			),
		).toEqual({
			success: true,
			data: {
				currentPassword: "old",
				password: "Correct-Horse-9",
				confirmPassword: "Correct-Horse-9",
			},
		});
	});
});
