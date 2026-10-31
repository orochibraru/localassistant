import { beforeEach, describe, expect, test } from "bun:test";

import { NotificationDTO } from "#lib/dto/notification.js";

import { createUser, resetDatabase } from "../../database.js";

describe("NotificationDTO", () => {
	beforeEach(() => {
		resetDatabase();
		createUser("ada");
		createUser("grace", "Grace");
	});

	test("fills each person's inbox, newest first, and counts what they haven't read", () => {
		NotificationDTO.record(["ada", "grace"], {
			title: "Front door",
			body: "It opened.",
			url: "/",
		});
		NotificationDTO.record(["ada"], {
			title: "Evening",
			body: "Time to close the blinds.",
			url: "/automations",
			actions: [{ action: "scene:night", title: "Night" }],
		});
		NotificationDTO.record([], { title: "Nobody", body: "", url: "/" });
		NotificationDTO.record(["gone"], { title: "Gone", body: "", url: "/" });
		const inbox = NotificationDTO.forUser("ada");
		expect(inbox.map((entry) => entry.title)).toEqual([
			"Evening",
			"Front door",
		]);
		expect(inbox[0]?.actions).toEqual([
			{ action: "scene:night", title: "Night" },
		]);
		expect(inbox[1]?.actions).toEqual([]);
		expect(NotificationDTO.unreadCount("ada")).toBe(2);
		NotificationDTO.markRead("ada", [inbox[1]?.id ?? 0]);
		expect(NotificationDTO.unreadCount("ada")).toBe(1);
		NotificationDTO.markRead("ada");
		expect(NotificationDTO.unreadCount("ada")).toBe(0);
		expect(NotificationDTO.unreadCount("grace")).toBe(1);
	});

	test("removes one, all of a person's, or the old ones, never someone else's", () => {
		const old = new Date(Date.now() - 40 * 86_400_000);
		NotificationDTO.record(
			["ada", "grace"],
			{ title: "Old", body: "", url: "/" },
			old,
		);
		NotificationDTO.record(["ada"], { title: "New", body: "", url: "/" });
		const graceOld = NotificationDTO.forUser("grace")[0]?.id ?? 0;
		expect(NotificationDTO.remove("ada", [graceOld])).toBe(0);
		expect(
			NotificationDTO.pruneBefore(new Date(Date.now() - 30 * 86_400_000)),
		).toBe(2);
		expect(NotificationDTO.forUser("ada").map((entry) => entry.title)).toEqual([
			"New",
		]);
		NotificationDTO.record(["grace"], { title: "Hers", body: "", url: "/" });
		expect(NotificationDTO.remove("ada")).toBe(1);
		expect(NotificationDTO.forUser("grace")).toHaveLength(1);
	});
});
