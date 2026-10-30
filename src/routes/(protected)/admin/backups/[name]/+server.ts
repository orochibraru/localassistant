import { error } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { backups } from "#lib/server/core/backups.js";

export const GET = ({ locals, params }) => {
	if (!locals.user || !access.isAdmin(locals.user)) {
		error(404, "Not found");
	}
	const path = backups.path(params.name);
	if (!path) {
		error(404, "That backup is gone.");
	}
	return new Response(Bun.file(path), {
		headers: {
			"content-type": "application/vnd.sqlite3",
			"content-disposition": `attachment; filename="${params.name}"`,
			"cache-control": "no-store",
		},
	});
};
