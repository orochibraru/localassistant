import { mcpEndpoint } from "#lib/server/mcp/server.js";

export const POST = ({ request, url }) => mcpEndpoint.handle(request, url);

export const GET = ({ request, url }) => mcpEndpoint.handle(request, url);
