import { distanceMetres } from "#lib/devices.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { HomeDTO } from "#lib/dto/home.js";
import { PresenceDTO } from "#lib/dto/presence.js";
import { UserDTO } from "#lib/dto/user.js";
import type { PersonPresence } from "#lib/presence.js";

const homeRadiusMetres = 150;
const widestAccuracyMetres = 500;
const freshLocationMs = 30 * 60_000;

export interface PresenceChange {
	userId: string;
	previous: boolean | null;
	home: boolean;
}

/**
 * Who is home: a person counts as home when one of the devices they own says so, a person tracker reporting home or a
 * phone whose fresh location is near the home, and as away when the ones that know all say away.
 */
class Presences {
	/** Where the devices `userId` owns put them right now: home, away, or `null` when none of them knows. */
	computed(userId: string, now = Date.now()): boolean | null {
		const answers = DeviceDTO.all()
			.filter((device) => device.ownerId === userId)
			.map((device) => this.#answer(device, now))
			.filter((answer) => answer !== null);
		if (answers.length === 0) {
			return null;
		}
		return answers.includes(true);
	}

	/**
	 * Works out where `userId` is again and records it; returns the change when they just arrived or left, `null` when
	 * nothing changed or nothing knows.
	 */
	update(userId: string, now = Date.now()): PresenceChange | null {
		const home = this.computed(userId, now);
		const previous = PresenceDTO.find(userId)?.home ?? null;
		if (home === null || home === previous) {
			return null;
		}
		PresenceDTO.record(userId, home);
		return { userId, previous, home };
	}

	/** Every person with where they were last known to be, and whether anything tracks them. */
	everyone(): PersonPresence[] {
		const known = new Map(
			PresenceDTO.all().map((entry) => [entry.userId, entry.toJSON()]),
		);
		const tracked = new Set(
			DeviceDTO.all()
				.filter(
					(device) =>
						device.kind === "app" || device.state?.type === "presence",
				)
				.map((device) => device.ownerId),
		);
		return UserDTO.people().map((person) => ({
			id: person.id,
			name: person.name,
			home: known.get(person.id)?.home ?? null,
			changedAt: known.get(person.id)?.changedAt ?? null,
			tracked: tracked.has(person.id),
		}));
	}

	/** Whether `who` is home: anyone at all, or the person with that id. */
	isHome(who: string): boolean {
		return who === "anyone"
			? PresenceDTO.all().some((entry) => entry.home === true)
			: PresenceDTO.find(who)?.home === true;
	}

	#answer(device: DeviceDTO, now: number): boolean | null {
		const state = device.state;
		if (state?.type === "presence") {
			return state.home;
		}
		if (state?.type !== "app" || !state.location) {
			return null;
		}
		const homeId = device.toJSON().homeId;
		const place = homeId ? HomeDTO.find(homeId)?.location : null;
		if (!place || now - Date.parse(state.location.at) > freshLocationMs) {
			return null;
		}
		const slack = Math.min(state.location.accuracy ?? 0, widestAccuracyMetres);
		return distanceMetres(place, state.location) <= homeRadiusMetres + slack;
	}
}

export const presences = new Presences();
