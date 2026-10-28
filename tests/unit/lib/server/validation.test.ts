import { describe, expect, test } from "bun:test";

import {
	changePasswordSchema,
	codeSchema,
	newAccountSchema,
	newPasswordSchema,
	signInSchema,
} from "#lib/server/validation/auth.js";
import {
	bambuPrinterSchema,
	climateChangeSchema,
	editBambuPrinterSchema,
	editFloorSchema,
	editRoomSchema,
	editTuyaCoverSchema,
	floorSchema,
	printerChangeSchema,
	renameDeviceSchema,
	roomSettingsSchema,
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
				roomId: null,
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

	test("a printer needs its address, serial number and 8-character access code", () => {
		expect(
			parseForm(
				bambuPrinterSchema,
				form({
					name: "P1S",
					host: "192.168.1.50",
					externalId: " 01p00a000000000 ",
					accessCode: "12345678",
				}),
			),
		).toEqual({
			success: true,
			data: {
				name: "P1S",
				roomId: null,
				host: "192.168.1.50",
				externalId: "01P00A000000000",
				accessCode: "12345678",
			},
		});
		const parsed = parseForm(
			bambuPrinterSchema,
			form({ name: "P1S", host: "", externalId: "x", accessCode: "123" }),
		);
		expect(parsed.success || Object.keys(parsed.errors).sort()).toEqual([
			"accessCode",
			"externalId",
			"host",
		]);
		expect(
			parseForm(
				editBambuPrinterSchema,
				form({ id: "p", name: "P1S", host: "192.168.1.51", accessCode: "" }),
			),
		).toEqual({
			success: true,
			data: {
				id: "p",
				name: "P1S",
				roomId: null,
				host: "192.168.1.51",
				accessCode: undefined,
			},
		});
		expect(
			printerChangeSchema.safeParse({ deviceId: "p", speed: 4 }).success,
		).toBe(true);
		expect(
			printerChangeSchema.safeParse({ deviceId: "p", speed: 5 }).success,
		).toBe(false);
		expect(printerChangeSchema.safeParse({ deviceId: "p" }).success).toBe(
			false,
		);
	});

	test("a room has a name, an icon and a place, and house means no room", () => {
		expect(
			parseForm(
				roomSettingsSchema,
				form({ name: " Garage ", icon: "garage", place: "outside" }),
			),
		).toEqual({
			success: true,
			data: { name: "Garage", icon: "garage", floorId: null, outdoor: true },
		});
		expect(
			parseForm(
				editRoomSchema,
				form({ id: "r", name: "Bedroom", place: "f1" }),
			),
		).toEqual({
			success: true,
			data: {
				id: "r",
				name: "Bedroom",
				icon: "door",
				floorId: "f1",
				outdoor: false,
			},
		});
		expect(
			parseForm(roomSettingsSchema, form({ name: "Hall", place: "none" })),
		).toMatchObject({ success: true, data: { floorId: null, outdoor: false } });
		for (const name of ["", "house", "Whole house"]) {
			expect(parseForm(roomSettingsSchema, form({ name })).success).toBe(false);
		}
		expect(
			parseForm(roomSettingsSchema, form({ name: "Hall", icon: "rocket" }))
				.success,
		).toBe(false);
		expect(
			parseForm(
				renameDeviceSchema,
				form({ id: "d", name: "PAC", roomId: "house" }),
			),
		).toEqual({ success: true, data: { id: "d", name: "PAC", roomId: null } });
		expect(
			parseForm(
				renameDeviceSchema,
				form({ id: "d", name: "PAC", roomId: "r" }),
			),
		).toEqual({ success: true, data: { id: "d", name: "PAC", roomId: "r" } });
	});

	test("a floor has a name and a level from the deep basement up", () => {
		expect(
			parseForm(floorSchema, form({ name: "Basement", level: "-1" })),
		).toEqual({ success: true, data: { name: "Basement", level: -1 } });
		expect(
			parseForm(editFloorSchema, form({ id: "f", name: "Attic", level: "2" })),
		).toEqual({ success: true, data: { id: "f", name: "Attic", level: 2 } });
		for (const level of ["-6", "31", "1.5", "up"]) {
			expect(parseForm(floorSchema, form({ name: "X", level })).success).toBe(
				false,
			);
		}
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
				roomId: null,
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
