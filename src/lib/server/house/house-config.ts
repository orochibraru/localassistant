import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import type { HomeDTO } from "#lib/dto/home.js";
import { JobDTO } from "#lib/dto/job.js";
import { RoomDTO } from "#lib/dto/room.js";
import { getSetting, setSetting } from "#lib/dto/setting.js";
import { noFloorPlace, outsidePlace, planBaseFloor } from "#lib/house.js";
import { secrets } from "#lib/server/core/secrets.js";
import { databaseConnection } from "#lib/server/db/database.js";
import type { HouseConfig } from "#lib/server/validation/house-config.js";

type RoomReference = NonNullable<HouseConfig["devices"][number]["room"]>;

export interface ImportCounts {
	floors: number;
	rooms: number;
	devices: number;
}

/** A home's floors, rooms with their plan, devices with their pins and MELCloud account as a JSON file, and back. */
class HouseConfiguration {
	/** The file for `home`; device keys, access codes and the MELCloud password only when `withSecrets`. */
	export(home: HomeDTO, withSecrets: boolean): HouseConfig {
		const floors = FloorDTO.inHome(home.id).map((floor) => floor.toJSON());
		const floorNames = new Map(floors.map((floor) => [floor.id, floor.name]));
		const rooms = RoomDTO.inHome(home.id).map((room) => room.toJSON());
		const reference = (roomId: string | null): RoomReference | null => {
			const room = rooms.find((entry) => entry.id === roomId);
			return room
				? {
						name: room.name,
						floor: floorNames.get(room.floorId ?? "") ?? null,
						outdoor: room.outdoor,
					}
				: null;
		};
		const base = planBaseFloor(floors, home.toJSON().planBaseFloorId);
		const pinOf = (pin: { place: string; x: number; y: number } | undefined) =>
			pin
				? {
						floor: floorNames.get(pin.place) ?? null,
						outdoor: pin.place === outsidePlace,
						x: pin.x,
						y: pin.y,
					}
				: null;
		const account = getSetting("melcloud");
		return {
			format: "localassistant-house",
			version: 1,
			exportedAt: new Date().toISOString(),
			home: { name: home.toJSON().name },
			floors: floors.map(({ id, name, level }) => ({
				name,
				level,
				planBase: id === base?.id,
			})),
			rooms: rooms.map((room) => ({
				...(reference(room.id) as RoomReference),
				icon: room.icon as HouseConfig["rooms"][number]["icon"],
				plan: room.plan,
			})),
			devices: DeviceDTO.inHome(home.id).flatMap((device) => {
				const row = device.toJSON();
				if (row.kind === "app") {
					return [];
				}
				const key = withSecrets ? device.encryptedLocalKey() : null;
				return {
					kind: row.kind,
					name: row.name,
					externalId: row.externalId,
					room: reference(row.roomId),
					host: row.host,
					protocolVersion:
						row.protocolVersion as HouseConfig["devices"][number]["protocolVersion"],
					inverted: row.inverted,
					buildingId: row.buildingId,
					controlDp: row.controlDp,
					positionDp: row.positionDp,
					positionStateDp: row.positionStateDp,
					...(key ? { secret: secrets.decrypt(key) } : {}),
					pin: pinOf(device.options.pin),
				};
			}),
			melcloud: account
				? {
						email: account.email,
						...(withSecrets
							? { password: secrets.decrypt(account.encryptedPassword) }
							: {}),
					}
				: null,
		};
	}

	/**
	 * Merges `config` into `home` in one transaction, never deleting: floors match by name, rooms by name and place,
	 * devices by kind and id; keys only replace existing ones when the file has them. The worker then reads every device.
	 */
	import(home: HomeDTO, config: HouseConfig): ImportCounts {
		const counts = databaseConnection
			.get()
			.transaction(() => this.#merge(home, config));
		for (const device of DeviceDTO.inHome(home.id)) {
			JobDTO.enqueue(
				"device.refresh",
				{ deviceId: device.id },
				{ maxAttempts: 1 },
			);
		}
		return counts;
	}

	/** Pins `device` where the file says, a floor found by name, or takes its pin off with null. */
	#pin(
		device: DeviceDTO,
		pin: HouseConfig["devices"][number]["pin"],
		floorIds: Map<string, string>,
	): void {
		const { pin: _old, ...options } = device.options;
		if (!pin) {
			device.setOptions(options);
			return;
		}
		const place = pin.outdoor
			? outsidePlace
			: ((pin.floor ? floorIds.get(pin.floor) : undefined) ?? noFloorPlace);
		device.setOptions({ ...options, pin: { place, x: pin.x, y: pin.y } });
	}

	#merge(home: HomeDTO, config: HouseConfig): ImportCounts {
		const floorIds = new Map<string, string>();
		for (const entry of config.floors) {
			const existing = FloorDTO.inHome(home.id).find(
				(floor) => floor.toJSON().name === entry.name,
			);
			if (existing) {
				existing.update(entry.name, entry.level);
				floorIds.set(entry.name, existing.toJSON().id);
			} else {
				floorIds.set(
					entry.name,
					FloorDTO.create(home.id, entry.name, entry.level).toJSON().id,
				);
			}
		}
		for (const floor of FloorDTO.inHome(home.id)) {
			floorIds.set(floor.toJSON().name, floor.toJSON().id);
		}
		const groundId = FloorDTO.nearestGround(home.id)?.toJSON().id ?? null;
		const placeOf = (reference: RoomReference) => ({
			floorId: reference.outdoor
				? null
				: ((reference.floor ? floorIds.get(reference.floor) : undefined) ??
					groundId),
			outdoor: reference.outdoor,
		});
		const findRoom = (reference: RoomReference) => {
			const place = placeOf(reference);
			return RoomDTO.inHome(home.id).find((room) => {
				const row = room.toJSON();
				return (
					row.name === reference.name &&
					row.floorId === place.floorId &&
					row.outdoor === place.outdoor
				);
			});
		};
		for (const entry of config.rooms) {
			const settings = {
				name: entry.name,
				icon: entry.icon,
				...placeOf(entry),
			};
			const existing = findRoom(entry);
			const room = existing ?? RoomDTO.create(home.id, settings);
			if (existing) {
				existing.update(settings);
			}
			if (entry.plan !== undefined) {
				room.place(entry.plan);
			}
		}
		for (const entry of config.devices) {
			const { room, secret, host, protocolVersion, buildingId, pin, ...rest } =
				entry;
			const device = DeviceDTO.upsert({
				...rest,
				homeId: home.id,
				roomId: room ? (findRoom(room)?.toJSON().id ?? null) : null,
				host: host ?? undefined,
				protocolVersion: protocolVersion ?? undefined,
				buildingId: buildingId ?? undefined,
				encryptedLocalKey: secret ? secrets.encrypt(secret) : undefined,
			});
			if (pin !== undefined) {
				this.#pin(device, pin, floorIds);
			}
		}
		const base = config.floors.find((floor) => floor.planBase);
		if (base) {
			home.setPlanBase(floorIds.get(base.name) ?? null);
		}
		if (config.melcloud?.password) {
			setSetting("melcloud", {
				email: config.melcloud.email,
				encryptedPassword: secrets.encrypt(config.melcloud.password),
			});
		}
		return {
			floors: config.floors.length,
			rooms: config.rooms.length,
			devices: config.devices.length,
		};
	}
}

export const houseConfiguration = new HouseConfiguration();
