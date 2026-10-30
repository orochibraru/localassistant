import { json } from "@sveltejs/kit";

import { access } from "#lib/server/auth/access.js";
import { mobileApi } from "#lib/server/mobile/api.js";

export const GET = ({ url }) =>
	json(mobileApi.house(access.requireUser(), mobileApi.home(url)));
