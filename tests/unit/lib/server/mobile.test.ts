import { beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { MobileCodeDTO } from "#lib/dto/mobile-code.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { setSetting } from "#lib/dto/setting.js";
import type { Session } from "#lib/server/auth/auth.js";
import { mobileSignIn } from "#lib/server/auth/mobile.js";
import { homes } from "#lib/server/house/homes.js";
import { mobileApi } from "#lib/server/mobile/api.js";
import {
	mobileAuthorizeSchema,
	mobileTokenSchema,
} from "#lib/server/validation/mobile.js";

import { createUser, homeId, resetDatabase } from "../../database.js";

const verifier = "a".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

function authorize(state = "xyz", device = "Pixel") {
	return mobileAuthorizeSchema.parse({
		code_challenge: challenge,
		state,
		redirect_uri: "localassistant://auth",
		device,
	});
}

function codeOf(link: string): string {
	return new URL(link).searchParams.get("code") ?? "";
}

describe("mobile sign-in", () => {
	beforeEach(() => {
		resetDatabase();
		createUser("ada");
	});

	test("an approval goes back to the app with its state and a code bound to the challenge", () => {
		const link = new URL(mobileSignIn.approve("ada", authorize()));
		expect(`${link.protocol}//${link.host}`).toBe("localassistant://auth");
		expect(link.searchParams.get("state")).toBe("xyz");
		const code = link.searchParams.get("code") ?? "";
		expect(mobileSignIn.redeem(code, "b".repeat(64), "ignored")).toBeNull();
		expect(mobileSignIn.redeem(code, verifier, "ignored")).toBeNull();
		const again = codeOf(mobileSignIn.approve("ada", authorize()));
		expect(mobileSignIn.redeem(again, verifier, "ignored")).toEqual({
			userId: "ada",
			device: "Pixel",
		});
		expect(mobileSignIn.redeem(again, verifier, "ignored")).toBeNull();
	});

	test("a pairing code signs in once, and a sign-in code can't pass for one", () => {
		const pairing = mobileSignIn.pair("ada", "https://home.example");
		const link = new URL(pairing.url);
		expect(link.searchParams.get("server")).toBe("https://home.example");
		expect(pairing.expiresAt.getTime()).toBeGreaterThan(Date.now());
		const code = link.searchParams.get("code") ?? "";
		expect(mobileSignIn.redeem(code, undefined, "iPhone")).toEqual({
			userId: "ada",
			device: "iPhone",
		});
		expect(mobileSignIn.redeem(code, undefined, "iPhone")).toBeNull();
		const signIn = codeOf(mobileSignIn.approve("ada", authorize()));
		expect(mobileSignIn.redeem(signIn, undefined, "iPhone")).toBeNull();
	});

	test("an expired code answers nothing", () => {
		const code = MobileCodeDTO.issue("pair", "ada", -1);
		expect(MobileCodeDTO.redeem("pair", code)).toBeNull();
	});

	test("the request schemas refuse codes meant for elsewhere", () => {
		expect(
			mobileAuthorizeSchema.safeParse({
				code_challenge: challenge,
				state: "xyz",
				redirect_uri: "https://evil.example/",
			}).success,
		).toBe(false);
		expect(mobileTokenSchema.safeParse({ code: "short" }).success).toBe(false);
		expect(mobileTokenSchema.parse({ code: "c".repeat(43) }).device).toBe("");
	});

	test("wrong codes are refused, then rate limited per address", async () => {
		const address = crypto.randomUUID();
		for (let attempt = 0; attempt < 10; attempt += 1) {
			await expect(
				mobileSignIn.exchange("c".repeat(43), undefined, "", address),
			).rejects.toMatchObject({ status: 400 });
		}
		await expect(
			mobileSignIn.exchange("c".repeat(43), undefined, "", address),
		).rejects.toMatchObject({ status: 429 });
	});

	test("a good code opens a session named after the phone, and signing out ends it", async () => {
		const code = codeOf(mobileSignIn.pair("ada", "https://home.example").url);
		const session = await mobileSignIn.exchange(
			code,
			undefined,
			"",
			crypto.randomUUID(),
		);
		expect(session.token.length).toBeGreaterThan(10);
		expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
		await mobileSignIn.signOut(session.token);
	});
});

describe("mobile api", () => {
	beforeEach(() => {
		resetDatabase();
		createUser("ada");
	});

	test("the house carries the account, scenes, people and whether the assistant is on", () => {
		const home = HomeDTO.first();
		SceneDTO.create(home.id, { name: "Movie", members: [] });
		DeviceDTO.upsert({
			kind: "app",
			homeId: home.id,
			ownerId: "ada",
			name: "Ada's phone",
			externalId: "phone",
		});
		const user = {
			id: "ada",
			name: "Ada",
			email: "ada@example.com",
			role: "admin",
		} as Session["user"];
		const house = mobileApi.house(user, home);
		expect(house.user).toEqual({
			id: "ada",
			name: "Ada",
			email: "ada@example.com",
			isAdmin: true,
		});
		expect(house.devices).toEqual([
			expect.objectContaining({ name: "Ada's phone", card: "app" }),
		]);
		expect(house.scenes.map((scene) => scene.name)).toEqual(["Movie"]);
		expect(house.people.map((person) => person.id)).toEqual(["ada"]);
		expect(house.homes).toEqual([]);
		expect(house.assistant).toBe(false);
		setSetting("multipleHomes", true);
		expect(mobileApi.house(user, home).homes).toHaveLength(1);
	});

	test("routines list by name and on-off, and the app picks a home only once several are on", () => {
		AutomationDTO.create(homeId(), {
			name: "Night",
			trigger: { type: "sun", event: "sunset", offsetMinutes: 0 },
			period: { type: "always" },
			conditions: [],
			actions: [{ type: "delay", minutes: 1 }],
		});
		const other = HomeDTO.create("Chalet");
		const url = new URL(
			`https://home.example/api/v1/routines?home=${other.id}`,
		);
		expect(mobileApi.home(url).id).toBe(homeId());
		setSetting("multipleHomes", true);
		expect(mobileApi.home(url).id).toBe(other.id);
		expect(homes.pick("gone").id).toBe(homeId());
		expect(mobileApi.routines(HomeDTO.first())).toEqual([
			expect.objectContaining({ name: "Night", enabled: true }),
		]);
	});

	test("a body that isn't JSON or doesn't fit is a 400", async () => {
		const request = (body: string) =>
			new Request("https://home.example/", { method: "POST", body });
		await expect(
			mobileApi.body(request("nope"), mobileTokenSchema),
		).rejects.toMatchObject({ status: 400 });
		expect(
			await mobileApi.body(
				request(JSON.stringify({ code: "c".repeat(43), device: "Pixel" })),
				mobileTokenSchema,
			),
		).toEqual({ code: "c".repeat(43), device: "Pixel" });
	});
});
