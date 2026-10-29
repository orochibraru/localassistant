import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { type RunningApp, startApp } from "../support/app.js";
import { Client } from "../support/client.js";

const admin = {
	email: "ada@example.com",
	name: "Ada",
	password: "Correct-Horse-Battery-9",
};

let app: RunningApp;
let database: Database;

function row<Row>(query: string, ...values: string[]): Row | undefined {
	return database.query(query).get(...values) as Row | undefined;
}

beforeAll(async () => {
	app = await startApp(4410);
	database = new Database(app.databasePath, { readonly: true });
});

afterAll(async () => {
	database?.close();
	await app?.stop();
});

describe("a fresh instance", () => {
	test("answers its health check", async () => {
		const response = await fetch(`${app.origin}/api/health`);
		expect(response.status).toBe(200);
	});

	test("takes remote calls from its own plain-HTTP origin, by name or address, and refuses other sites", async () => {
		const call = (origin: string, host?: string) =>
			fetch(`${origin}/_app/remote/aaaaaa/nothing`, {
				method: "POST",
				headers: {
					Origin: origin,
					"Content-Type": "application/json",
					...(host ? { Host: host } : {}),
				},
				body: "{}",
			});
		expect((await call(app.origin)).status).not.toBe(403);
		const byAddress = app.origin.replace("localhost", "127.0.0.1");
		expect((await call(byAddress)).status).not.toBe(403);
		const crossSite = await fetch(`${app.origin}/_app/remote/aaaaaa/nothing`, {
			method: "POST",
			headers: {
				Origin: "http://elsewhere.example",
				"Content-Type": "application/json",
			},
			body: "{}",
		});
		expect(crossSite.status).toBe(403);
	});

	test("sends every page to the setup flow", async () => {
		const response = await new Client(app.origin).get("/");
		expect(response.status).toBeGreaterThanOrEqual(300);
		expect(response.headers.get("location")).toContain("/auth/setup");
	});

	test("refuses a wrong setup code and a form from another origin", async () => {
		const client = new Client(app.origin);
		expect(
			(await client.action("/auth/setup", "verify", { code: "000000" })).type,
		).toBe("failure");
		const crossSite = await client.action(
			"/auth/setup",
			"verify",
			{ code: await app.setupCode() },
			"https://evil.example",
		);
		expect(crossSite.status).toBe(403);
	});

	test("won't create the admin before the code is entered", async () => {
		const result = await new Client(app.origin).action(
			"/auth/setup",
			"create",
			{
				...admin,
				confirmPassword: admin.password,
			},
		);
		expect(result.type).toBe("failure");
	});
});

describe("setting up and using it", () => {
	const client = () => signedIn;
	let signedIn: Client;

	beforeAll(async () => {
		signedIn = new Client(app.origin);
		const verified = await signedIn.action("/auth/setup", "verify", {
			code: await app.setupCode(),
		});
		expect(verified.type).toBe("success");
		const created = await signedIn.action("/auth/setup", "create", {
			...admin,
			confirmPassword: admin.password,
		});
		expect(created.type).toBe("redirect");
		expect(created.location).toContain("admin/overview");
	});

	test("the first account is the admin, and setup is closed after it", async () => {
		expect(
			row<{ role: string }>(
				"select role from user where email = ?",
				admin.email,
			)?.role,
		).toBe("admin");
		const again = await new Client(app.origin).get("/auth/setup");
		expect(again.headers.get("location")).toContain("/auth/sign-in");
		expect((await client().get("/admin/overview")).status).toBe(200);
	});

	test("signing in checks the password", async () => {
		const stranger = new Client(app.origin);
		const wrong = await stranger.action("/auth/sign-in", "password", {
			email: admin.email,
			password: "not-the-password",
		});
		expect(wrong.type).toBe("failure");
		const right = await stranger.action("/auth/sign-in", "password", {
			email: admin.email,
			password: admin.password,
		});
		expect(right.type).toBe("redirect");
		const home = await stranger.get("/");
		expect(home.status).toBe(200);
		expect(home.headers.get("content-security-policy")).toContain(
			"frame-ancestors 'none'",
		);
	});

	test("an admin adds a blind, its key stays encrypted and the worker reads it", async () => {
		const added = await client().action("/devices", "add", {
			plugin: "tuya",
			name: "Bedroom blind",
			"value:host": "127.0.0.1",
			"value:deviceId": "bfabcdabcdabcdabcdgh",
			"value:localKey": "abcdabcdabcdabcd",
			"value:protocolVersion": "3.3",
		});
		expect(added.type).toBe("success");
		const stored = row<{ secrets: string }>(
			"select secrets from device where name = ?",
			"Bedroom blind",
		);
		expect(stored?.secrets).toContain("localKey");
		expect(stored?.secrets).not.toContain("abcdabcdabcdabcd");
		expect(await (await client().get("/")).text()).toContain("Bedroom blind");
		let read: { state_at: number | null } | undefined;
		for (let attempt = 0; attempt < 40 && !read?.state_at; attempt += 1) {
			await Bun.sleep(250);
			read = row<{ state_at: number | null }>(
				"select state_at from device where name = ?",
				"Bedroom blind",
			);
		}
		expect(read?.state_at).toBeTruthy();
		const blind = row<{ id: string; secrets: string }>(
			"select id, secrets from device where name = ?",
			"Bedroom blind",
		);
		const edited = await client().action("/devices", "edit", {
			id: blind?.id ?? "",
			name: "Office blind",
			"value:host": "127.0.0.2",
			"value:deviceId": "bfabcdabcdabcdabcdgh",
			"value:protocolVersion": "3.4",
			"value:inverted": "true",
			"value:localKey": "",
		});
		expect(edited.type).toBe("success");
		const after = row<{ host: string; fields: string; secrets: string }>(
			"select host, fields, secrets from device where id = ?",
			blind?.id ?? "",
		);
		expect(after?.host).toBe("127.0.0.2");
		expect(JSON.parse(after?.fields ?? "{}")).toMatchObject({ inverted: true });
		expect(after?.secrets).toBe(blind?.secrets ?? "");
	});

	test("an admin adds a printer and its access code stays encrypted", async () => {
		const added = await client().action("/devices", "add", {
			plugin: "bambu",
			name: "P1S",
			"value:host": "127.0.0.1",
			"value:serial": "01P00A000000000",
			"value:accessCode": "12345678",
		});
		expect(added.type).toBe("success");
		const stored = row<{ id: string; secrets: string }>(
			"select id, secrets from device where kind = 'bambu-printer'",
		);
		expect(stored?.secrets).toContain("accessCode");
		expect(stored?.secrets).not.toContain("12345678");
		expect(await (await client().get("/")).text()).toContain("P1S");
		const edited = await client().action("/devices", "edit", {
			id: stored?.id ?? "",
			name: "Workshop printer",
			"value:host": "127.0.0.2",
			"value:serial": "01P00A000000000",
			"value:accessCode": "",
		});
		expect(edited.type).toBe("success");
		expect(
			row<{ name: string; secrets: string }>(
				"select name, secrets from device where id = ?",
				stored?.id ?? "",
			),
		).toEqual({ name: "Workshop printer", secrets: stored?.secrets ?? "" });
	});

	test("rooms group devices, and removing one hands its devices to the whole house", async () => {
		const added = await client().action("/house", "addRoom", {
			name: "Bedroom",
		});
		expect(added.type).toBe("success");
		const duplicate = await client().action("/house", "addRoom", {
			name: "Bedroom",
		});
		expect(duplicate.type).toBe("failure");
		const room = row<{ id: string }>(
			"select id from room where name = ?",
			"Bedroom",
		);
		const blind = row<{ id: string; name: string }>(
			"select id, name from device where kind = 'tuya-cover'",
		);
		const moved = await client().action("/devices", "edit", {
			id: blind?.id ?? "",
			name: blind?.name ?? "",
			roomId: room?.id ?? "",
			"value:host": "127.0.0.2",
			"value:deviceId": "bfabcdabcdabcdabcdgh",
		});
		expect(moved.type).toBe("success");
		const refused = await client().action("/devices", "edit", {
			id: blind?.id ?? "",
			name: blind?.name ?? "",
			roomId: "not-a-room",
			"value:host": "127.0.0.2",
			"value:deviceId": "bfabcdabcdabcdabcdgh",
		});
		expect(refused.type).toBe("failure");
		const roomPage = await client().get(`/rooms/${room?.id}`);
		expect(roomPage.status).toBe(200);
		expect(await roomPage.text()).toContain(blind?.name ?? "");
		expect((await client().get("/rooms/house")).status).toBe(200);
		expect((await client().get("/rooms/not-a-room")).status).toBe(404);
		const removed = await client().action("/house", "removeRoom", {
			id: room?.id ?? "",
		});
		expect(removed.type).toBe("success");
		expect(
			row<{ room_id: string | null }>(
				"select room_id from device where id = ?",
				blind?.id ?? "",
			)?.room_id,
		).toBeNull();
	});

	test("floors hold rooms, outside rooms stand apart, and a deleted floor keeps its rooms", async () => {
		const floor = await client().action("/house", "addFloor", {
			name: "Ground floor",
			level: "0",
		});
		expect(floor.type).toBe("success");
		const floorId =
			row<{ id: string }>("select id from floor where name = ?", "Ground floor")
				?.id ?? "";
		const kitchen = await client().action("/house", "addRoom", {
			name: "Kitchen",
			icon: "kitchen",
			place: floorId,
		});
		expect(kitchen.type).toBe("success");
		const garage = await client().action("/house", "addRoom", {
			name: "Garage",
			icon: "garage",
			place: "outside",
		});
		expect(garage.type).toBe("success");
		expect(
			row<{ floor_id: string; icon: string }>(
				"select floor_id, icon from room where name = ?",
				"Kitchen",
			),
		).toEqual({ floor_id: floorId, icon: "kitchen" });
		expect(
			row<{ outdoor: number }>(
				"select outdoor from room where name = ?",
				"Garage",
			)?.outdoor,
		).toBe(1);
		const house = await client().get("/house");
		expect(house.status).toBe(200);
		const page = await house.text();
		expect(page).toContain("Ground floor");
		expect(page).toContain("Outside");
		const kitchenId =
			row<{ id: string }>("select id from room where name = ?", "Kitchen")
				?.id ?? "";
		const floorless = await client().action("/house", "editRoom", {
			id: kitchenId,
			name: "Big kitchen",
			icon: "dining",
			place: "none",
		});
		expect(floorless.type).toBe("failure");
		const edited = await client().action("/house", "editRoom", {
			id: kitchenId,
			name: "Big kitchen",
			icon: "dining",
			place: floorId,
		});
		expect(edited.type).toBe("success");
		const removed = await client().action("/house", "removeFloor", {
			id: floorId,
		});
		expect(removed.type).toBe("success");
		expect(
			row<{ name: string; floor_id: string | null }>(
				"select name, floor_id from room where id = ?",
				kitchenId,
			),
		).toEqual({ name: "Big kitchen", floor_id: null });
		expect((await client().get("/devices")).status).toBe(200);
	});

	test("an AI app without a token is pointed at sign-in", async () => {
		const mcp = await fetch(`${app.origin}/mcp`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		});
		expect(mcp.status).toBe(401);
		expect(mcp.headers.get("www-authenticate")).toContain(
			"/.well-known/oauth-protected-resource/mcp",
		);
		const metadata = await fetch(
			`${app.origin}/.well-known/oauth-protected-resource/mcp`,
		);
		expect(await metadata.json()).toEqual(
			expect.objectContaining({ resource: `${app.origin}/mcp` }),
		);
		for (const path of ["oauth-authorization-server", "openid-configuration"]) {
			const discovery = await fetch(`${app.origin}/.well-known/${path}`);
			expect(discovery.status).toBe(200);
			expect(await discovery.json()).toEqual(
				expect.objectContaining({ issuer: `${app.origin}/api/auth` }),
			);
		}
	});

	test("several homes are opt-in, and the last one stays", async () => {
		const early = await client().action("/admin/homes", "add", {
			name: "Chalet",
		});
		expect(early.type).toBe("failure");
		expect(
			(
				await client().action("/admin/homes", "multiple", {
					multipleHomes: "true",
				})
			).type,
		).toBe("success");
		expect(
			(await client().action("/admin/homes", "add", { name: "Chalet" })).type,
		).toBe("success");
		expect((await client().action("/admin/homes", "multiple", {})).type).toBe(
			"failure",
		);
		const chalet = row<{ id: string }>(
			"select id from home where name = ?",
			"Chalet",
		);
		expect(
			(
				await client().action("/admin/homes", "remove", {
					id: chalet?.id ?? "",
				})
			).type,
		).toBe("success");
		const last = row<{ id: string }>("select id from home");
		expect(
			(await client().action("/admin/homes", "remove", { id: last?.id ?? "" }))
				.type,
		).toBe("failure");
		expect((await client().action("/admin/homes", "multiple", {})).type).toBe(
			"success",
		);
		expect(
			row<{ count: number }>(
				"select count(*) as count from device where home_id is null",
			)?.count,
		).toBe(0);
	});

	test("admins download the configuration, without secrets unless asked", async () => {
		const plain = await client().get("/admin/configuration/export");
		expect(plain.status).toBe(200);
		expect(plain.headers.get("content-disposition")).toContain("attachment");
		const config = (await plain.json()) as {
			format: string;
			devices: { secrets?: Record<string, string> }[];
		};
		expect(config.format).toBe("localassistant-house");
		expect(config.devices.every((device) => device.secrets === undefined)).toBe(
			true,
		);
		const full = (await (
			await client().get("/admin/configuration/export?secrets=true")
		).json()) as { devices: { secrets?: Record<string, string> }[] };
		expect(
			full.devices.some((device) => device.secrets?.localKey !== undefined),
		).toBe(true);
		expect(
			(await new Client(app.origin).get("/admin/configuration/export")).status,
		).toBe(404);
	});

	test("there's no sign-up page", async () => {
		expect((await new Client(app.origin).get("/auth/sign-up")).status).toBe(
			404,
		);
	});

	test("the devices tab is for admins only", async () => {
		const outsider = new Client(app.origin);
		const response = await outsider.get("/devices");
		expect(response.headers.get("location")).toContain("/auth/sign-in");
		const refused = await outsider.action("/devices", "add", {
			plugin: "tuya",
			name: "Sneaky",
			"value:host": "127.0.0.1",
			"value:deviceId": "bf9999999999abcdefgh",
			"value:localKey": "abcdabcdabcdabcd",
		});
		expect(refused.type).not.toBe("success");
	});

	test("a required authenticator app sends people to Security without looping", async () => {
		const writer = new Database(app.databasePath);
		writer.run(
			"insert into setting (key, value) values ('requireTwoFactor', 'true')",
		);
		writer.close();
		const home = await client().get("/");
		expect(home.status).toBe(303);
		expect(home.headers.get("location")).toContain(
			"/account/security?required=two-factor",
		);
		expect((await client().get("/account/security")).status).toBe(200);
		const data = await client().get("/account/security/__data.json");
		expect(await data.text()).not.toContain('"type":"redirect"');
	});

	test("signing out ends the session", async () => {
		const result = await client().action("/account", "signOut", {});
		expect(["redirect", "success"]).toContain(result.type);
		expect((await client().get("/")).headers.get("location")).toContain(
			"/auth/sign-in",
		);
	});
});
