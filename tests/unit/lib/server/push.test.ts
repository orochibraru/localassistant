import { beforeEach, describe, expect, test } from "bun:test";

import { base64UrlBytes, deviceName } from "#lib/device-name.js";
import { PushSubscriptionDTO } from "#lib/dto/push-subscription.js";
import { getSetting } from "#lib/dto/setting.js";
import { secrets } from "#lib/server/core/secrets.js";
import { databaseConnection } from "#lib/server/db/database.js";
import { pushSubscription } from "#lib/server/db/schema.js";
import {
	pushNotifications,
	type SendPush,
} from "#lib/server/notifications/push.js";

import { createUser, resetDatabase } from "../../database.js";

function subscribe(userId: string, endpoint: string) {
	PushSubscriptionDTO.save(userId, {
		endpoint,
		p256dh: "p256dh-key",
		auth: "auth-key",
		device: "Chrome on Mac",
	});
}

describe("device names", () => {
	test("name the browser and the system", () => {
		expect(
			deviceName(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
			),
		).toBe("Safari on iPhone");
		expect(
			deviceName(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
			),
		).toBe("Edge on Windows");
		expect(deviceName("Firefox/131.0")).toBe("Firefox");
		expect(deviceName("Linux")).toBe("Linux");
		expect(deviceName("curl/8")).toBe("This browser");
	});

	test("decode a base64url server key", () => {
		expect([...base64UrlBytes("AQID_-8")]).toEqual([1, 2, 3, 255, 239]);
	});
});

describe("push", () => {
	beforeEach(() => {
		resetDatabase();
		databaseConnection.get().delete(pushSubscription).run();
	});

	test("the VAPID keys are made once and kept encrypted", () => {
		const first = pushNotifications.vapidPublicKey();
		expect(pushNotifications.vapidPublicKey()).toBe(first);
		const stored = getSetting("vapid");
		expect(stored?.publicKey).toBe(first);
		expect(
			secrets.decrypt(stored?.encryptedPrivateKey ?? "").length,
		).toBeGreaterThan(20);
	});

	test("subscriptions belong to one account and move with the browser", () => {
		createUser("ada");
		createUser("grace", "Grace");
		subscribe("ada", "https://push.example/one");
		subscribe("ada", "https://push.example/two");
		expect(PushSubscriptionDTO.forUser("ada")).toHaveLength(2);
		subscribe("grace", "https://push.example/two");
		expect(PushSubscriptionDTO.forUser("ada")).toHaveLength(1);
		PushSubscriptionDTO.removeFor("ada", "https://push.example/two");
		expect(PushSubscriptionDTO.forUser("grace")).toHaveLength(1);
		PushSubscriptionDTO.removeFor("grace", "https://push.example/two");
		expect(PushSubscriptionDTO.forUsers([])).toEqual([]);
		expect(PushSubscriptionDTO.forUsers(["ada", "grace"])).toHaveLength(1);
	});

	test("delivers to every device of the users and forgets dead ones", async () => {
		createUser("ada");
		createUser("grace", "Grace");
		subscribe("ada", "https://push.example/live");
		subscribe("ada", "https://push.example/gone");
		subscribe("grace", "https://push.example/other");
		const sent: string[] = [];
		const send: SendPush = (subscription, payload, options) => {
			if (subscription.endpoint.endsWith("gone")) {
				return Promise.reject(
					Object.assign(new Error("Gone"), { statusCode: 410 }),
				);
			}
			sent.push(subscription.endpoint);
			expect(JSON.parse(payload)).toEqual({
				title: "Lisbon trip",
				body: "Grace added dinner",
				url: "/groups/one",
			});
			expect(options.vapidDetails?.publicKey).toBe(
				pushNotifications.vapidPublicKey(),
			);
			return Promise.resolve();
		};
		const delivered = await pushNotifications.deliver(
			["ada"],
			{ title: "Lisbon trip", body: "Grace added dinner", url: "/groups/one" },
			send,
		);
		expect(delivered).toBe(1);
		expect(sent).toEqual(["https://push.example/live"]);
		expect(
			PushSubscriptionDTO.forUser("ada").map((entry) => entry.endpoint),
		).toEqual(["https://push.example/live"]);
		expect(
			await pushNotifications.deliver(
				["nobody"],
				{ title: "", body: "", url: "/" },
				send,
			),
		).toBe(0);
	});

	test("other push errors are thrown so the job retries", async () => {
		createUser("ada");
		subscribe("ada", "https://push.example/flaky");
		const send: SendPush = () =>
			Promise.reject(Object.assign(new Error("Busy"), { statusCode: 503 }));
		expect(
			pushNotifications.deliver(
				["ada"],
				{ title: "t", body: "b", url: "/" },
				send,
			),
		).rejects.toThrow("Busy");
		expect(PushSubscriptionDTO.forUser("ada")).toHaveLength(1);
	});

	test("the worker job sends nothing when nobody subscribed", async () => {
		const { jobHandlers } = await import("#lib/server/jobs/handlers.js");
		await jobHandlers["push.send"]({
			userIds: ["ada"],
			title: "t",
			body: "b",
			url: "/",
		});
		expect(getSetting("vapid")).toBeNull();
	});
});
