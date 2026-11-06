import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { DeviceDTO } from "#lib/dto/device.js";
import { JobDTO } from "#lib/dto/job.js";
import { RoomDTO } from "#lib/dto/room.js";
import { deviceAdmin } from "#lib/server/devices/device-admin.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { pluginSetup } from "#lib/server/plugins/setup.js";

import { createUser, homeId, resetDatabase } from "../../database.js";

const blind = {
	plugin: "tuya",
	name: "Office blind",
	roomId: "house",
	"value:host": "127.0.0.1",
	"value:deviceId": "bfabcdabcdabcdabcdgh",
	"value:localKey": "abcdabcdabcdabcd",
};

const spies: { mockRestore(): void }[] = [];

function watch<Spy extends { mockRestore(): void }>(spy: Spy): Spy {
	spies.push(spy);
	return spy;
}

function upsert(kind: string, externalId: string, fields = {}): DeviceDTO {
	return DeviceDTO.upsert({
		kind,
		homeId: homeId(),
		name: externalId,
		externalId,
		fields,
	});
}

function failChoices(): void {
	watch(
		spyOn(pluginSetup, "withChoices").mockRejectedValue(
			new Error("The service is down."),
		),
	);
}

beforeEach(async () => {
	resetDatabase();
	await plugins.loadInstalled();
});

afterEach(() => {
	for (const spy of spies.splice(0)) {
		spy.mockRestore();
	}
});

describe("adding a device", () => {
	test("adds it from the form and says what's wrong otherwise", async () => {
		expect(await deviceAdmin.add(homeId(), { plugin: "gone" })).toEqual({
			ok: false,
			status: 404,
			error: "That integration is off or gone.",
		});
		expect(
			await deviceAdmin.add(homeId(), { ...blind, plugin: "frigate" }),
		).toMatchObject({ ok: false, status: 404 });
		expect(
			await deviceAdmin.add(homeId(), { ...blind, "value:host": "" }),
		).toMatchObject({
			ok: false,
			status: 400,
			errors: { "value:host": ["Fill in ip address."] },
		});
		expect(
			await deviceAdmin.add(homeId(), { ...blind, roomId: "nowhere" }),
		).toEqual({
			ok: false,
			status: 400,
			errors: { roomId: ["That room is gone."] },
		});

		const added = await deviceAdmin.add(homeId(), blind);
		expect(added.ok && added.value.toJSON()).toMatchObject({
			kind: "tuya-cover",
			name: "Office blind",
			roomId: null,
		});

		failChoices();
		expect(await deviceAdmin.add(homeId(), blind)).toEqual({
			ok: false,
			status: 400,
			error: "The service is down.",
		});
	});

	test("says what the plugin refused", async () => {
		watch(
			spyOn(pluginSetup, "addDevice").mockRejectedValue(
				new Error("That blind doesn't answer."),
			),
		);
		expect(await deviceAdmin.add(homeId(), blind)).toEqual({
			ok: false,
			status: 400,
			error: "That blind doesn't answer.",
		});
	});

	test("tries the form without adding anything", async () => {
		const tried = watch(
			spyOn(pluginSetup, "test").mockResolvedValue("Found a blind at 50%."),
		);
		expect(await deviceAdmin.test({ plugin: "gone" })).toMatchObject({
			ok: false,
			status: 404,
		});
		expect(
			await deviceAdmin.test({ ...blind, "value:deviceId": "short" }),
		).toMatchObject({ ok: false, status: 400 });
		expect(await deviceAdmin.test(blind)).toEqual({
			ok: true,
			value: "Found a blind at 50%.",
		});
		expect(tried).toHaveBeenCalledTimes(1);
		expect(DeviceDTO.all()).toHaveLength(0);

		failChoices();
		expect(await deviceAdmin.test(blind)).toMatchObject({
			ok: false,
			error: "The service is down.",
		});
	});
});

describe("editing a device", () => {
	test("refuses a device that's gone", async () => {
		expect(await deviceAdmin.edit(homeId(), {})).toEqual({
			ok: false,
			status: 404,
			error: "That device is gone.",
		});
		expect(await deviceAdmin.edit(homeId(), { id: "nothing" })).toMatchObject({
			ok: false,
			status: 404,
		});
	});

	test("saves a phone's name, room and owner, and works out presence again", async () => {
		const ada = createUser("ada");
		const grace = createUser("grace", "Grace");
		const phone = upsert("app", "phone-1");
		const room = RoomDTO.create(homeId(), {
			name: "Kitchen",
			icon: "sofa",
			floorId: null,
			outdoor: false,
		}).toJSON();
		const form = { id: phone.id, name: "Ada's phone", roomId: room.id };

		expect(
			await deviceAdmin.edit(homeId(), { ...form, name: "" }),
		).toMatchObject({ ok: false, errors: { name: ["Name the device."] } });
		expect(
			await deviceAdmin.edit(homeId(), { ...form, roomId: "nowhere" }),
		).toMatchObject({ errors: { roomId: ["That room is gone."] } });
		expect(
			await deviceAdmin.edit(homeId(), { ...form, ownerId: "nobody-here" }),
		).toMatchObject({ errors: { ownerId: ["That account is gone."] } });

		expect(
			await deviceAdmin.edit(homeId(), { ...form, ownerId: ada.id }),
		).toMatchObject({ ok: true });
		expect(DeviceDTO.find(phone.id)?.toJSON()).toMatchObject({
			name: "Ada's phone",
			roomId: room.id,
			ownerId: ada.id,
		});
		expect(JobDTO.isQueued("presence.update")).toBe(true);

		const enqueued = watch(spyOn(JobDTO, "enqueue"));
		await deviceAdmin.edit(homeId(), { ...form, ownerId: grace.id });
		expect(enqueued.mock.calls.map((call) => call[1])).toEqual([
			{ userId: ada.id },
			{ userId: grace.id },
		]);
	});

	test("gives a presence tracker to someone", async () => {
		const ada = createUser("ada");
		const tracker = upsert("home-assistant-presence", "person.ada");
		const form = { id: tracker.id, name: "Ada", roomId: "house" };
		const edited = watch(
			spyOn(pluginSetup, "editDevice").mockResolvedValue(undefined),
		);

		expect(
			await deviceAdmin.edit(homeId(), { ...form, ownerId: "nobody-here" }),
		).toMatchObject({ errors: { ownerId: ["That account is gone."] } });
		expect(
			await deviceAdmin.edit(homeId(), { ...form, ownerId: ada.id }),
		).toMatchObject({ ok: true });
		expect(DeviceDTO.find(tracker.id)?.ownerId).toBe(ada.id);
		expect(edited).toHaveBeenCalledTimes(1);

		await deviceAdmin.edit(homeId(), { ...form, ownerId: "nobody" });
		expect(DeviceDTO.find(tracker.id)?.ownerId).toBeNull();
	});

	test("only renames a discovered device, or one whose integration is gone", async () => {
		const edited = watch(
			spyOn(pluginSetup, "editDevice").mockResolvedValue(undefined),
		);
		const discovered = upsert("tuya-cover", "found-1");
		expect(
			await deviceAdmin.edit(homeId(), {
				id: discovered.id,
				name: "Found blind",
				roomId: "house",
			}),
		).toMatchObject({ ok: true });
		expect(edited.mock.calls[0]?.[3]).toEqual({});

		const orphan = upsert("removed-kind", "orphan-1");
		expect(
			await deviceAdmin.edit(homeId(), {
				id: orphan.id,
				name: "Old lamp",
				roomId: "nowhere",
			}),
		).toMatchObject({ errors: { roomId: ["That room is gone."] } });
		expect(
			await deviceAdmin.edit(homeId(), {
				id: orphan.id,
				name: "Old lamp",
				roomId: "house",
			}),
		).toMatchObject({ ok: true });
		expect(DeviceDTO.find(orphan.id)?.name).toBe("Old lamp");
		expect(edited).toHaveBeenCalledTimes(1);
	});

	test("checks a device added from the form against the form again", async () => {
		const added = await deviceAdmin.add(homeId(), blind);
		if (!added.ok) {
			throw new Error("Not added");
		}
		const form = {
			id: added.value.id,
			name: "Desk blind",
			roomId: "house",
			"value:host": "127.0.0.2",
			"value:deviceId": "bfabcdabcdabcdabcdgh",
		};

		expect(
			await deviceAdmin.edit(homeId(), { ...form, "value:host": "" }),
		).toMatchObject({
			ok: false,
			errors: { "value:host": ["Fill in ip address."] },
		});

		watch(
			spyOn(pluginSetup, "editDevice").mockRejectedValue(
				new Error("That blind doesn't answer."),
			),
		);
		expect(await deviceAdmin.edit(homeId(), form)).toEqual({
			ok: false,
			status: 400,
			error: "That blind doesn't answer.",
		});

		failChoices();
		expect(await deviceAdmin.edit(homeId(), form)).toMatchObject({
			ok: false,
			error: "The service is down.",
		});
	});
});

describe("integrations", () => {
	test("connects one with its form, once the broker it needs is there", async () => {
		const connected = watch(spyOn(pluginSetup, "connect").mockResolvedValue(3));
		expect(await deviceAdmin.connect(homeId(), { plugin: "tuya" })).toEqual({
			ok: false,
			status: 404,
			error: "That integration is off or gone.",
		});
		expect(
			await deviceAdmin.connect(homeId(), { plugin: "frigate" }),
		).toMatchObject({
			ok: false,
			status: 400,
			errors: { "value:url": ["Fill in address."] },
		});
		expect(
			await deviceAdmin.connect(homeId(), {
				plugin: "zigbee",
				"value:topic": "zigbee2mqtt",
			}),
		).toEqual({
			ok: false,
			status: 400,
			error: "Connect the MQTT broker first.",
		});
		expect(
			await deviceAdmin.connect(homeId(), {
				plugin: "frigate",
				"value:url": "http://127.0.0.1:5000",
			}),
		).toEqual({ ok: true, value: 3 });
		expect(connected.mock.calls[0]?.[2]).toMatchObject({
			url: "http://127.0.0.1:5000",
		});

		failChoices();
		expect(
			await deviceAdmin.connect(homeId(), { plugin: "frigate" }),
		).toMatchObject({ ok: false, error: "The service is down." });
	});

	test("looks for new devices, lists a field's options and disconnects", async () => {
		watch(spyOn(pluginSetup, "discover").mockResolvedValue(2));
		watch(
			spyOn(pluginSetup, "choices").mockResolvedValue([
				{ value: "a", label: "A" },
			]),
		);
		expect(await deviceAdmin.discover({ plugin: "gone" })).toMatchObject({
			ok: false,
			status: 404,
		});
		expect(await deviceAdmin.discover({ plugin: "frigate" })).toEqual({
			ok: true,
			value: 2,
		});

		expect(await deviceAdmin.choices({ plugin: "frigate" })).toMatchObject({
			ok: false,
			status: 404,
		});
		expect(
			await deviceAdmin.choices({ plugin: "frigate", field: "camera" }),
		).toEqual({ ok: true, value: [{ value: "a", label: "A" }] });

		expect(deviceAdmin.disconnect({ plugin: "gone" })).toMatchObject({
			ok: false,
			status: 404,
		});
		upsert("frigate-camera", "front");
		expect(deviceAdmin.disconnect({ plugin: "frigate" })).toEqual({
			ok: true,
			value: 1,
		});
	});

	test("removes a device once", () => {
		const device = upsert("tuya-cover", "found-1");
		expect(deviceAdmin.remove(homeId(), device.id)).toBe(true);
		expect(deviceAdmin.remove(homeId(), device.id)).toBe(false);
	});
});
