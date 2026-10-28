import { databaseConnection } from "#lib/server/db/database.js";
import {
	appearance,
	device,
	invite,
	job,
	setting,
	user,
	verification,
} from "#lib/server/db/schema.js";

export function resetDatabase(): void {
	databaseConnection.migrate();
	const database = databaseConnection.get();
	for (const table of [
		job,
		invite,
		setting,
		appearance,
		verification,
		device,
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
