import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import {
	describeCondition,
	describePresence,
	describeTrigger,
} from "#lib/automations.js";
import type { DeviceState } from "#lib/devices.js";
import { AutomationRunDTO } from "#lib/dto/automation-run.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { JobDTO } from "#lib/dto/job.js";
import { PresenceDTO } from "#lib/dto/presence.js";
import { automations } from "#lib/server/automations/automations.js";
import { devices } from "#lib/server/devices/devices.js";
import { presences } from "#lib/server/house/presence.js";
import { jobHandlers } from "#lib/server/jobs/handlers.js";
import { automationSchema } from "#lib/server/validation/automation.js";

import { createUser, resetDatabase } from "../../database.js";

const place = { latitude: 45.77, longitude: 3.08 };
const tracker = (home: boolean | null) =>
	({ type: "presence", home, zone: null, battery: null }) satisfies DeviceState;

function locatedHome(): HomeDTO {
	const home = HomeDTO.first();
	home.locate({ place: "Home", ...place, timezone: "Europe/Paris" });
	return home;
}

function owned(
	home: HomeDTO,
	ownerId: string,
	name: string,
	kind: string,
	state: DeviceState,
): DeviceDTO {
	const device = DeviceDTO.upsert({
		kind,
		homeId: home.id,
		name,
		externalId: name,
	});
	device.setOwner(ownerId);
	device.saveState(state);
	return device;
}

function phone(
	latitude: number,
	at: Date,
	accuracy: number | null = 20,
): DeviceState {
	return {
		type: "app",
		battery: null,
		charging: null,
		platform: "Safari on iPhone",
		location: {
			latitude,
			longitude: place.longitude,
			accuracy,
			at: at.toISOString(),
		},
	};
}

describe("presence", () => {
	beforeEach(resetDatabase);

	test("a person is home when a tracker or a fresh phone location says so", () => {
		const home = locatedHome();
		const ada = createUser("ada", "Ada").id;
		const now = Date.now();
		expect(presences.computed(ada, now)).toBeNull();
		const watch = owned(
			home,
			ada,
			"Watch",
			"mqtt-discovery-tracker",
			tracker(null),
		);
		expect(presences.computed(ada, now)).toBeNull();
		watch.saveState(tracker(false));
		expect(presences.computed(ada, now)).toBe(false);
		const iphone = owned(
			home,
			ada,
			"iPhone",
			"app",
			phone(place.latitude, new Date(now - 60_000)),
		);
		expect(presences.computed(ada, now)).toBe(true);
		iphone.saveState(phone(place.latitude + 0.01, new Date(now - 60_000)));
		expect(presences.computed(ada, now)).toBe(false);
		iphone.saveState(
			phone(place.latitude + 0.003, new Date(now - 60_000), 400),
		);
		expect(presences.computed(ada, now)).toBe(true);
		iphone.saveState(phone(place.latitude, new Date(now - 60 * 60_000)));
		watch.saveState(tracker(null));
		expect(presences.computed(ada, now)).toBeNull();
		iphone.saveState({
			type: "app",
			battery: 50,
			charging: false,
			platform: "x",
			location: null,
		});
		expect(presences.computed(ada, now)).toBeNull();
	});

	test("records arrivals and departures, and lists who's tracked", () => {
		const home = locatedHome();
		const ada = createUser("ada", "Ada").id;
		createUser("bob", "Bob");
		const watch = owned(
			home,
			ada,
			"Watch",
			"home-assistant-presence",
			tracker(true),
		);
		expect(presences.update(ada)).toEqual({
			userId: ada,
			previous: null,
			home: true,
		});
		expect(presences.update(ada)).toBeNull();
		expect(presences.isHome("anyone")).toBe(true);
		expect(presences.isHome(ada)).toBe(true);
		expect(presences.isHome("bob")).toBe(false);
		watch.saveState(tracker(false));
		expect(presences.update(ada)).toMatchObject({
			previous: true,
			home: false,
		});
		expect(presences.everyone()).toMatchObject([
			{ id: "ada", name: "Ada", home: false, tracked: true },
			{ id: "bob", name: "Bob", home: null, changedAt: null, tracked: false },
		]);
		expect(PresenceDTO.find(ada)?.home).toBe(false);
	});

	test("routines run when someone, a person, the first one or the last one comes and goes", async () => {
		const home = locatedHome();
		const ada = createUser("ada", "Ada").id;
		const bob = createUser("bob", "Bob").id;
		const command = spyOn(devices, "command").mockResolvedValue();
		const routine = (
			name: string,
			event: "arrive" | "leave",
			who: string,
			conditions: AutomationDTO["conditions"] = [],
		) =>
			AutomationDTO.create(home.id, {
				name,
				trigger: { type: "presence", event, who },
				period: { type: "always" },
				conditions,
				actions: [{ type: "delay", minutes: 1 }],
			});
		routine("Anyone", "arrive", "anyone");
		routine("First", "arrive", "first");
		routine("Ada", "arrive", ada);
		routine("Last", "leave", "last");
		routine("Bob leaves", "leave", bob);
		routine("Nobody home", "leave", "anyone", [
			{ type: "presence", who: "anyone", home: false },
		]);
		const ran = () =>
			AutomationRunDTO.recentInHome(home.id)
				.filter((run) => run.status !== "skipped")
				.map((run) => run.automationName)
				.toSorted();

		PresenceDTO.record(ada, true);
		await automations.onPresence({ userId: ada, previous: null, home: true });
		expect(ran()).toEqual(["Ada", "Anyone", "First"]);
		expect(AutomationRunDTO.recentInHome(home.id)[0]?.cause).toBe(
			"Ada gets home",
		);

		PresenceDTO.record(bob, true);
		await automations.onPresence({ userId: bob, previous: null, home: true });
		expect(ran()).toEqual(["Ada", "Anyone", "Anyone", "First"]);

		PresenceDTO.record(bob, false);
		await automations.onPresence({ userId: bob, previous: true, home: false });
		expect(ran()).toEqual(["Ada", "Anyone", "Anyone", "Bob leaves", "First"]);
		expect(
			AutomationRunDTO.recentInHome(home.id).find(
				(run) => run.status === "skipped",
			),
		).toMatchObject({
			automationName: "Nobody home",
			error: "Nobody is home: not now.",
		});

		PresenceDTO.record(ada, false);
		await automations.onPresence({ userId: ada, previous: true, home: false });
		expect(ran()).toContain("Last");
		expect(ran()).toContain("Nobody home");
		command.mockRestore();
	});

	test("the worker works presence out again after a report or an owner change", async () => {
		const home = locatedHome();
		const ada = createUser("ada", "Ada").id;
		const iphone = owned(
			home,
			ada,
			"iPhone",
			"app",
			phone(place.latitude, new Date()),
		);
		devices.reportApp(iphone, {
			battery: 80,
			charging: false,
			platform: "Safari on iPhone",
			location: { ...place, accuracy: 10 },
		});
		const job = JobDTO.claimNext();
		expect(job?.type).toBe("presence.update");
		await jobHandlers["presence.update"]({ userId: ada });
		expect(PresenceDTO.find(ada)?.home).toBe(true);
		await jobHandlers["presence.update"]({ userId: ada });
		expect(PresenceDTO.find(ada)?.home).toBe(true);
	});

	test("reads as words and is checked by the form", () => {
		const name = () => "Ada";
		expect(describePresence("arrive", "anyone", name)).toBe(
			"someone gets home",
		);
		expect(describePresence("arrive", "first", name)).toBe(
			"the first person gets home",
		);
		expect(describePresence("leave", "last", name)).toBe(
			"the last person leaves",
		);
		expect(
			describeTrigger(
				{ type: "presence", event: "leave", who: "ada" },
				undefined,
				name,
			),
		).toBe("When Ada leaves");
		expect(
			describeTrigger({ type: "presence", event: "arrive", who: "ada" }),
		).toBe("When someone gets home");
		expect(
			describeCondition({ type: "presence", who: "anyone", home: true }, name),
		).toBe("Someone is home");
		expect(
			describeCondition(
				{ type: "presence", who: "ada", home: false },
				name,
				name,
			),
		).toBe("Ada is away");
		expect(
			describeCondition({ type: "presence", who: "ada", home: true }, name),
		).toBe("Someone is home");
		const routine = (event: string, who: string) => ({
			name: "Welcome",
			trigger: { type: "presence", event, who },
			period: { type: "always" },
			actions: [{ type: "delay", minutes: 1 }],
		});
		expect(automationSchema.safeParse(routine("arrive", "first")).success).toBe(
			true,
		);
		expect(automationSchema.safeParse(routine("leave", "last")).success).toBe(
			true,
		);
		expect(automationSchema.safeParse(routine("leave", "ada")).success).toBe(
			true,
		);
		expect(automationSchema.safeParse(routine("leave", "first")).success).toBe(
			false,
		);
		expect(automationSchema.safeParse(routine("arrive", "last")).success).toBe(
			false,
		);
	});
});
