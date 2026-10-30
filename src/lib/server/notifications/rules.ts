import { describeTest, testFires } from "#lib/automations.js";
import type { DeviceState } from "#lib/devices.js";
import type { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { NotificationRuleDTO } from "#lib/dto/notification-rule.js";

/** People's own "tell me when" rules: a push to them alone when a device gets to the state they asked about. */
class NotificationRules {
	/** Pushes to everyone whose rule the change of `device` from `previous` to `next` sets off; returns how many. */
	onChange(
		device: DeviceDTO,
		previous: DeviceState | null,
		next: DeviceState,
	): number {
		const name = device.toJSON().name;
		const fired = NotificationRuleDTO.all().filter(
			(rule) =>
				rule.test.deviceId === device.id &&
				testFires(rule.test, previous, next),
		);
		for (const rule of fired) {
			JobDTO.enqueue("push.send", {
				userIds: [rule.userId],
				title: name,
				body: `${describeTest(rule.test, () => name)}.`,
				url: "/",
			});
		}
		return fired.length;
	}
}

export const notificationRules = new NotificationRules();
