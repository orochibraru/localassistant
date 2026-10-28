import { error } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { homes } from "#lib/server/house/homes.js";
import { houseConfiguration } from "#lib/server/house/house-config.js";

export const GET = ({ cookies, locals, url }) => {
	if (!access.isAdmin(locals.user)) {
		error(404, "Not found");
	}
	const home = homes.current(cookies);
	const withSecrets = url.searchParams.get("secrets") === "true";
	const config = houseConfiguration.export(home, withSecrets);
	const slug =
		home
			.toJSON()
			.name.toLowerCase()
			.replaceAll(/[^a-z0-9]+/g, "-")
			.replaceAll(/^-|-$/g, "") || "home";
	const date = new Date().toISOString().slice(0, 10);
	return new Response(JSON.stringify(config, null, 2), {
		headers: {
			"content-type": "application/json",
			"content-disposition": `attachment; filename="localassistant-${slug}-${date}.json"`,
			"cache-control": "no-store",
		},
	});
};
