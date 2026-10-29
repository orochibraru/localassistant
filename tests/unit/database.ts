import { HomeDTO } from "#lib/dto/home.js";
import { databaseConnection } from "#lib/server/db/database.js";
import {
	appearance,
	device,
	floor,
	home,
	invite,
	job,
	plugin,
	room,
	setting,
	user,
	verification,
} from "#lib/server/db/schema.js";

export function resetDatabase(): void {
	databaseConnection.migrate();
	const database = databaseConnection.get();
	for (const table of [
		job,
		plugin,
		invite,
		setting,
		appearance,
		verification,
		device,
		room,
		floor,
		home,
		user,
	]) {
		database.delete(table).run();
	}
}

export function createUser(
	id: string,
	name = "Ada",
): { id: string; name: string } {
	databaseConnection
		.get()
		.insert(user)
		.values({ id, name, email: `${id}@example.com` })
		.run();
	return { id, name };
}

export function homeId(): string {
	return HomeDTO.first().id;
}
