import { authService } from "#lib/server/auth/auth.js";

export const GET = ({ request }) => authService.get().handler(request);
