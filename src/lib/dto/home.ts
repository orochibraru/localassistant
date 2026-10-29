import { asc, eq, sql } from "drizzle-orm";

import { BaseDTO } from "#lib/dto/base-dto.js";
import { databaseConnection } from "#lib/server/db/database.js";
import {
	automation,
	device,
	floor,
	home,
	room,
} from "#lib/server/db/schema.js";
import type { Weather } from "#lib/weather.js";

export interface HomeLocation {
	place: string;
	latitude: number;
	longitude: number;
	timezone: string;
}

export interface HomeRow {
	id: string;
	name: string;
	place: string | null;
	latitude: number | null;
	longitude: number | null;
	timezone: string | null;
	weather: Weather | null;
	weatherAt: Date | null;
}

const columns = {
	id: home.id,
	name: home.name,
	place: home.place,
	latitude: home.latitude,
	longitude: home.longitude,
	timezone: home.timezone,
	weather: home.weather,
	weatherAt: home.weatherAt,
};

type SelectedRow = Omit<HomeRow, "weather"> & { weather: unknown };

export class HomeDTO extends BaseDTO<HomeRow> {
	/** Every home, oldest first; homes made in the same second keep their creation order. */
	static all(): HomeDTO[] {
		return databaseConnection
			.get()
			.select(columns)
			.from(home)
			.orderBy(asc(home.createdAt), sql`rowid`)
			.all()
			.map((row) => HomeDTO.#wrap(row));
	}

	/** The home with `id`. */
	static find(id: string): HomeDTO | undefined {
		const row = databaseConnection
			.get()
			.select(columns)
			.from(home)
			.where(eq(home.id, id))
			.get();
		return row ? HomeDTO.#wrap(row) : undefined;
	}

	/** The first home, made when there is none so every floor, room and device has one to belong to. */
	static first(): HomeDTO {
		return HomeDTO.all()[0] ?? HomeDTO.create("Home");
	}

	/** Adds a home. */
	static create(name: string): HomeDTO {
		const row = databaseConnection
			.get()
			.insert(home)
			.values({ name })
			.returning(columns)
			.get();
		return HomeDTO.#wrap(row);
	}

	static #wrap(row: SelectedRow): HomeDTO {
		return new HomeDTO({ ...row, weather: row.weather as Weather | null });
	}

	get id(): string {
		return this.row.id;
	}

	/** Where the home is, or `null` before an admin set it. */
	get location(): HomeLocation | null {
		const { place, latitude, longitude, timezone } = this.row;
		return place !== null &&
			latitude !== null &&
			longitude !== null &&
			timezone !== null
			? { place, latitude, longitude, timezone }
			: null;
	}

	get weather(): Weather | null {
		return this.row.weather;
	}

	/** Sets where the home is, forgetting the weather of the old place. */
	locate(location: HomeLocation | null): void {
		const values = {
			place: location?.place ?? null,
			latitude: location?.latitude ?? null,
			longitude: location?.longitude ?? null,
			timezone: location?.timezone ?? null,
			weather: null,
			weatherAt: null,
		};
		databaseConnection
			.get()
			.update(home)
			.set(values)
			.where(eq(home.id, this.row.id))
			.run();
		Object.assign(this.row, values);
	}

	/** Records the latest weather. */
	saveWeather(weather: Weather): void {
		const values = { weather, weatherAt: new Date() };
		databaseConnection
			.get()
			.update(home)
			.set(values)
			.where(eq(home.id, this.row.id))
			.run();
		Object.assign(this.row, values);
	}

	/** Renames the home. */
	rename(name: string): void {
		databaseConnection
			.get()
			.update(home)
			.set({ name })
			.where(eq(home.id, this.row.id))
			.run();
		this.row.name = name;
	}

	/** Removes the home with its automations, devices, rooms and floors, in one transaction: the foreign keys have no ON DELETE. */
	delete(): void {
		databaseConnection.get().transaction((transaction) => {
			transaction
				.delete(automation)
				.where(eq(automation.homeId, this.row.id))
				.run();
			transaction.delete(device).where(eq(device.homeId, this.row.id)).run();
			transaction.delete(room).where(eq(room.homeId, this.row.id)).run();
			transaction.delete(floor).where(eq(floor.homeId, this.row.id)).run();
			transaction.delete(home).where(eq(home.id, this.row.id)).run();
		});
	}
}
