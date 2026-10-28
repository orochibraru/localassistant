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
		const added = await client().action("/admin/devices", "addTuya", {
			name: "Bedroom blind",
			host: "127.0.0.1",
			externalId: "bfabcdabcdabcdabcdgh",
			localKey: "abcdabcdabcdabcd",
			protocolVersion: "3.3",
		});
		expect(added.type).toBe("success");
		const stored = row<{ local_key: string }>(
			"select local_key from device where name = ?",
			"Bedroom blind",
		);
		expect(stored?.local_key).toBeTruthy();
		expect(stored?.local_key).not.toContain("abcdabcdabcdabcd");
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
		const blind = row<{ id: string; local_key: string }>(
			"select id, local_key from device where name = ?",
			"Bedroom blind",
		);
		const edited = await client().action("/admin/devices", "editTuya", {
			id: blind?.id ?? "",
			name: "Office blind",
			host: "127.0.0.2",
			protocolVersion: "3.4",
			inverted: "true",
			localKey: "",
		});
		expect(edited.type).toBe("success");
		expect(
			row<{ host: string; inverted: number; local_key: string }>(
				"select host, inverted, local_key from device where id = ?",
				blind?.id ?? "",
			),
		).toEqual({
			host: "127.0.0.2",
			inverted: 1,
			local_key: blind?.local_key ?? "",
		});
	});

	test("the devices tab is for admins only", async () => {
		const outsider = new Client(app.origin);
		const response = await outsider.get("/admin/devices");
		expect(response.headers.get("location")).toContain("/auth/sign-in");
		const refused = await outsider.action("/admin/devices", "addTuya", {
			name: "Sneaky",
			host: "127.0.0.1",
			externalId: "bf9999999999abcdefgh",
			localKey: "abcdabcdabcdabcd",
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
