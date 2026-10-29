import { LogbookEntryDTO } from "#lib/dto/logbook-entry.js";
import { logbookPageSchema } from "#lib/server/validation/device.js";

const pageSize = 100;

export const load = async ({ parent, url }) => {
	const { home } = await parent();
	const page = logbookPageSchema.safeParse({
		before: url.searchParams.get("before") ?? undefined,
	});
	const before = page.success ? page.data.before : undefined;
	const lines = LogbookEntryDTO.recent(home.id, pageSize, before);
	return {
		lines,
		older: lines.length === pageSize ? lines.at(-1)?.id : undefined,
	};
};
