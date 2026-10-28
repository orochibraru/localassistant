import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";

import { authService } from "#lib/server/auth/auth.js";

export const GET = ({ request }) =>
	oauthProviderOpenIdConfigMetadata(authService.get())(request);
