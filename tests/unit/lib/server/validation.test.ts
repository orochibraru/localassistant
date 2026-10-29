import { describe, expect, test } from "bun:test";

import { plugins } from "#lib/server/plugins/registry.js";
import {
	changePasswordSchema,
	codeSchema,
	newAccountSchema,
	newPasswordSchema,
	signInSchema,
} from "#lib/server/validation/auth.js";
import {
	buttonSchema,
	climateChangeSchema,
	editFloorSchema,
	editRoomSchema,
	fanChangeSchema,
	floorSchema,
	lightChangeSchema,
	lockSchema,
	mediaChangeSchema,
	planChangesSchema,
	printerChangeSchema,
	roomSettingsSchema,
	vacuumChangeSchema,
} from "#lib/server/validation/device.js";
import { parseForm } from "#lib/server/validation/form.js";
import {
	addDeviceSchema,
	editDeviceSchema,
} from "#lib/server/validation/plugins.js";

const fieldsOf = (id: string) => plugins.get(id)?.manifest.device?.fields ?? [];
const tuyaCoverSchema = addDeviceSchema(fieldsOf("tuya"));
const editTuyaCoverSchema = editDeviceSchema(fieldsOf("tuya"));
const bambuPrinterSchema = addDeviceSchema(fieldsOf("bambu"));
const editBambuPrinterSchema = editDeviceSchema(fieldsOf("bambu"));
const renameDeviceSchema = editDeviceSchema([]);

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
			"value:host": "192.168.1.41",
			"value:deviceId": "bf1234567890abcdefgh",
			"value:protocolVersion": "3.4",
		};
		expect(parseForm(editTuyaCoverSchema, form(fields))).toEqual({
			success: true,
			data: {
				id: "blind",
				name: "Office",
				roomId: null,
				values: {
					host: "192.168.1.41",
					deviceId: "bf1234567890abcdefgh",
					protocolVersion: "3.4",
					controlDp: 1,
					positionDp: 2,
					positionStateDp: 3,
					inverted: false,
				},
			},
		});
		expect(
			parseForm(
				editTuyaCoverSchema,
				form({ ...fields, "value:localKey": "short" }),
			).success,
		).toBe(false);
		const custom = parseForm(
			editTuyaCoverSchema,
			form({ ...fields, "value:controlDp": "101", "value:positionDp": "0" }),
		);
		expect(custom.success || Object.keys(custom.errors)).toEqual([
			"value:positionDp",
		]);
		expect(
			parseForm(
				editTuyaCoverSchema,
				form({ ...fields, "value:protocolVersion": "9.9" }),
			).success,
		).toBe(false);
	});

	test("a printer needs its address, serial number and 8-character access code", () => {
		expect(
			parseForm(
				bambuPrinterSchema,
				form({
					plugin: "bambu",
					name: "P1S",
					"value:host": "192.168.1.50",
					"value:serial": " 01p00a000000000 ",
					"value:accessCode": "12345678",
				}),
			),
		).toEqual({
			success: true,
			data: {
				plugin: "bambu",
				name: "P1S",
				roomId: null,
				values: {
					host: "192.168.1.50",
					serial: "01p00a000000000",
					accessCode: "12345678",
				},
			},
		});
		const parsed = parseForm(
			bambuPrinterSchema,
			form({
				plugin: "bambu",
				name: "P1S",
				"value:host": "",
				"value:serial": "x",
				"value:accessCode": "123",
			}),
		);
		expect(parsed.success || Object.keys(parsed.errors).sort()).toEqual([
			"value:accessCode",
			"value:host",
			"value:serial",
		]);
		expect(
			parseForm(
				editBambuPrinterSchema,
				form({
					id: "p",
					name: "P1S",
					"value:host": "192.168.1.51",
					"value:serial": "01P00A000000000",
					"value:accessCode": "",
				}),
			),
		).toEqual({
			success: true,
			data: {
				id: "p",
				name: "P1S",
				roomId: null,
				values: { host: "192.168.1.51", serial: "01P00A000000000" },
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

	test("a vacuum change names a command, a mode, a suction or a wetness within the robot's range", () => {
		expect(
			vacuumChangeSchema.safeParse({
				deviceId: "v",
				mode: "both",
				suction: "max",
				wetness: 32,
			}).success,
		).toBe(true);
		expect(
			vacuumChangeSchema.safeParse({ deviceId: "v", wetness: 33 }).success,
		).toBe(false);
		expect(
			vacuumChangeSchema.safeParse({ deviceId: "v", mode: "spin" }).success,
		).toBe(false);
		expect(vacuumChangeSchema.safeParse({ deviceId: "v" }).success).toBe(false);
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
		).toEqual({
			success: true,
			data: { id: "d", name: "PAC", roomId: null, values: {} },
		});
		expect(
			parseForm(
				renameDeviceSchema,
				form({ id: "d", name: "PAC", roomId: "r" }),
			),
		).toEqual({
			success: true,
			data: { id: "d", name: "PAC", roomId: "r", values: {} },
		});
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
					plugin: "tuya",
					name: "Living room",
					"value:host": "192.168.1.40",
					"value:deviceId": "bf1234567890abcdefgh",
					"value:localKey": "abcdabcdabcdabcd",
				}),
			),
		).toEqual({
			success: true,
			data: {
				plugin: "tuya",
				name: "Living room",
				roomId: null,
				values: {
					host: "192.168.1.40",
					deviceId: "bf1234567890abcdefgh",
					localKey: "abcdabcdabcdabcd",
					protocolVersion: "3.3",
					controlDp: 1,
					positionDp: 2,
					positionStateDp: 3,
					inverted: false,
				},
			},
		});
		const parsed = parseForm(
			tuyaCoverSchema,
			form({
				plugin: "tuya",
				name: "",
				"value:host": "",
				"value:deviceId": "x",
				"value:localKey": "short",
			}),
		);
		expect(parsed.success || Object.keys(parsed.errors).sort()).toEqual([
			"name",
			"value:deviceId",
			"value:host",
			"value:localKey",
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

	test("plan changes keep every room part inside the plan", () => {
		const part = { x: 2, y: 2, width: 4, height: 3 };
		expect(
			planChangesSchema.safeParse({
				rooms: [
					{ roomId: "kitchen", plan: [part] },
					{ roomId: "hall", plan: null },
				],
				moves: [{ deviceId: "robot", roomId: "house" }],
				baseFloorId: "ground",
			}),
		).toMatchObject({
			success: true,
			data: { moves: [{ deviceId: "robot", roomId: null }] },
		});
		expect(
			planChangesSchema.safeParse({
				rooms: [{ roomId: "kitchen", plan: [{ ...part, x: 47 }] }],
				moves: [],
			}).success,
		).toBe(false);
	});
});

describe("device control schemas", () => {
	const deviceId = "device-1";

	test("take a change with something in it, within range", () => {
		expect(
			lightChangeSchema.safeParse({
				deviceId,
				brightness: 50,
				temperature: 2700,
				color: { hue: 120, saturation: 40 },
			}).success,
		).toBe(true);
		expect(lightChangeSchema.safeParse({ deviceId }).success).toBe(false);
		expect(
			lightChangeSchema.safeParse({ deviceId, brightness: 101 }).success,
		).toBe(false);
		expect(fanChangeSchema.safeParse({ deviceId, speed: 30 }).success).toBe(
			true,
		);
		expect(fanChangeSchema.safeParse({ deviceId }).success).toBe(false);
		expect(
			mediaChangeSchema.safeParse({ deviceId, action: "next", volume: 5 })
				.success,
		).toBe(true);
		expect(
			mediaChangeSchema.safeParse({ deviceId, action: "rewind" }).success,
		).toBe(false);
		expect(mediaChangeSchema.safeParse({ deviceId }).success).toBe(false);
		expect(lockSchema.safeParse({ deviceId, locked: true }).success).toBe(true);
		expect(buttonSchema.safeParse({ deviceId }).success).toBe(true);
	});
});
