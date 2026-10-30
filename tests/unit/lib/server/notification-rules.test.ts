import { beforeEach, describe, expect, test } from "bun:test";

import { describeAction } from "#lib/automations.js";
import type { DeviceState } from "#lib/devices.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { NotificationRuleDTO } from "#lib/dto/notification-rule.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { sceneAction } from "#lib/notifications.js";
import { automations } from "#lib/server/automations/automations.js";
import { notificationRules } from "#lib/server/notifications/rules.js";
import { automationSchema } from "#lib/server/validation/automation.js";
import {
	notificationActionSchema,
	notificationRuleSchema,
} from "#lib/server/validation/notification.js";

import { createUser, homeId, resetDatabase } from "../../database.js";

const washer = (power: number) =>
	({ type: "switch", on: true, power, energy: null }) satisfies DeviceState;

function queuedPushes() {
	const pushes: unknown[] = [];
	for (let job = JobDTO.claimNext(); job; job = JobDTO.claimNext()) {
		if (job.type === "push.send") {
			pushes.push(job.payload);
		}
	}
	return pushes;
}

describe("notifications", () => {
	beforeEach(resetDatabase);

	test("a person's rule pushes to them alone when a device gets there", () => {
		const ada = createUser("ada", "Ada").id;
		const bob = createUser("bob", "Bob").id;
		const device = DeviceDTO.upsert({
			kind: "shelly-plug",
			homeId: homeId(),
			name: "Washer",
			externalId: "washer",
		});
		const rule = NotificationRuleDTO.create(ada, {
			deviceId: device.id,
			check: "below",
			value: 5,
		});
		NotificationRuleDTO.create(bob, {
			deviceId: "other",
			check: "on",
			value: null,
		});
		expect(NotificationRuleDTO.forUser(ada).map((entry) => entry.test)).toEqual(
			[{ deviceId: device.id, check: "below", value: 5 }],
		);
		expect(notificationRules.onChange(device, washer(500), washer(2))).toBe(1);
		expect(notificationRules.onChange(device, washer(2), washer(1))).toBe(0);
		expect(queuedPushes()).toEqual([
			{
				userIds: [ada],
				title: "Washer",
				body: "Washer goes below 5.",
				url: "/",
			},
		]);
		NotificationRuleDTO.remove(rule.toJSON().id, bob);
		expect(NotificationRuleDTO.all()).toHaveLength(2);
		NotificationRuleDTO.remove(rule.toJSON().id, ada);
		expect(NotificationRuleDTO.forUser(ada)).toEqual([]);
		expect(rule.userId).toBe(ada);
	});

	test("a routine tells everyone, the admins or one person, with scene buttons", async () => {
		const ada = createUser("ada", "Ada").id;
		const scene = SceneDTO.create(homeId(), {
			name: "Lock up",
			members: [{ deviceId: "x", command: { type: "lock", locked: true } }],
		});
		const routine = AutomationDTO.create(homeId(), {
			name: "Door",
			trigger: { type: "sun", event: "sunset", offsetMinutes: 0 },
			period: { type: "always" },
			conditions: [],
			actions: [
				{
					type: "notify",
					who: "everyone",
					title: "The door is open",
					body: "Since 10 minutes.",
					sceneIds: [scene.id, "gone"],
				},
				{
					type: "notify",
					who: ada,
					title: "Just you",
					body: "",
					sceneIds: [],
				},
				{
					type: "notify",
					who: "removed",
					title: "Nobody",
					body: "",
					sceneIds: [],
				},
				{
					type: "notify",
					who: "admins",
					title: "Admins",
					body: "",
					sceneIds: [],
				},
			],
		});
		await automations.run(routine, "Run by hand");
		expect(AutomationDTO.find(routine.id)?.toJSON().runError).toBe(
			"Nobody to tell: that account is gone. Nobody to tell: that account is gone.",
		);
		expect(queuedPushes()).toEqual([
			{
				userIds: [ada],
				title: "The door is open",
				body: "Since 10 minutes.",
				url: "/",
				actions: [{ action: sceneAction(scene.id), title: "Lock up" }],
			},
			{ userIds: [ada], title: "Just you", body: "", url: "/", actions: [] },
		]);
		const names = {
			devices: new Map(),
			rooms: new Map(),
			people: new Map([[ada, "Ada"]]),
		};
		const notify = {
			type: "notify" as const,
			title: "Hi",
			body: "",
			sceneIds: [],
		};
		expect(describeAction({ ...notify, who: "everyone" }, names)).toBe(
			'Tell everyone "Hi"',
		);
		expect(describeAction({ ...notify, who: "admins" }, names)).toBe(
			'Tell the admins "Hi"',
		);
		expect(describeAction({ ...notify, who: ada }, names)).toBe(
			'Tell Ada "Hi"',
		);
		expect(describeAction({ ...notify, who: "gone" }, names)).toBe(
			'Tell a removed account "Hi"',
		);
	});

	test("forms check notify steps, rules and notification buttons", () => {
		const routine = {
			name: "Tell",
			trigger: { type: "sun", event: "sunset", offsetMinutes: 0 },
			period: { type: "always" },
			actions: [
				{
					type: "notify",
					who: "everyone",
					title: "Hi",
					body: "",
					sceneIds: ["a", "b"],
				},
			],
		};
		expect(automationSchema.safeParse(routine).success).toBe(true);
		expect(
			automationSchema.safeParse({
				...routine,
				actions: [{ ...routine.actions[0], sceneIds: ["a", "b", "c"] }],
			}).success,
		).toBe(false);
		expect(
			notificationActionSchema.safeParse({ action: sceneAction("abc") })
				.success,
		).toBe(true);
		expect(
			notificationActionSchema.safeParse({ action: "scene:" }).success,
		).toBe(false);
		expect(
			notificationActionSchema.safeParse({ action: "device:abc" }).success,
		).toBe(false);
		expect(
			notificationRuleSchema.safeParse({
				test: JSON.stringify({ deviceId: "d", check: "open", value: null }),
			}).success,
		).toBe(true);
		expect(notificationRuleSchema.safeParse({ test: "{" }).success).toBe(false);
	});
});
