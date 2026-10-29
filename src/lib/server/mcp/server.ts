import {
	type AuthInfo,
	bearerAuthChallengeResponse,
	createMcpHandler,
	getOAuthProtectedResourceMetadataUrl,
	McpServer,
	OAuthError,
	OAuthErrorCode,
	verifyBearerToken,
} from "@modelcontextprotocol/server";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { z } from "zod";

import {
	climateModes,
	coverActions,
	printerCommands,
	printerSpeeds,
	vacuumCommands,
} from "#lib/devices.js";
import { AiAppDTO } from "#lib/dto/ai-app.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import { houseGroups } from "#lib/house.js";
import { authService } from "#lib/server/auth/auth.js";
import { configuration } from "#lib/server/core/config.js";
import { devices } from "#lib/server/devices/devices.js";

const jwksCacheKey = {};

const deviceIdField = z
	.string()
	.min(1)
	.describe("A device id from list_house.");

const wholeHouse = "house";

const homeIdField = z
	.string()
	.min(1)
	.optional()
	.describe("A home id from list_homes; the first home when left out.");

/** The MCP server AI apps reach at `/mcp`, reading the house and driving its devices for whoever signed them in. */
class McpEndpoint {
	/**
	 * Answers one MCP request reaching `url` for the person whose access token it carries, or the challenge that sends an
	 * AI app through sign-in and consent when the token is missing, expired or revoked; a 404 off HTTPS.
	 */
	async handle(request: Request, url: URL): Promise<Response> {
		const resource = authService.mcpResource(
			authService.publicOrigin() ?? url.origin,
		);
		if (!resource) {
			return Response.json(
				{ message: "AI apps need this server on HTTPS." },
				{ status: 404 },
			);
		}
		const resourceUrl = new URL(resource);
		const challenge = {
			resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
		};
		try {
			await verifyBearerToken(request.headers.get("authorization"), {
				...challenge,
				expectedResource: resourceUrl,
				verifier: {
					verifyAccessToken: (token) => this.#verify(token, resourceUrl),
				},
			});
		} catch (error) {
			return bearerAuthChallengeResponse(error, challenge);
		}
		return createMcpHandler(() => this.server()).fetch(request);
	}

	/** An MCP server with the house tools; every signed-in person may read and drive every device. */
	server(): McpServer {
		const server = new McpServer({
			name: "LocalAssistant",
			version: configuration.get().appVersion,
		});
		this.#registerReading(server);
		this.#registerCovers(server);
		this.#registerClimate(server);
		this.#registerPrinter(server);
		this.#registerVacuum(server);
		return server;
	}

	/** A home as an AI app sees it: floors, rooms and outside spaces, each device with its room and last state. */
	house(home: HomeDTO) {
		const rooms = RoomDTO.inHome(home.id).map((room) => room.toJSON());
		const floors = FloorDTO.inHome(home.id).map((floor) => floor.toJSON());
		return {
			home: home.toJSON(),
			groups: houseGroups(floors, rooms).map((group) => ({
				name: group.name,
				rooms: group.rooms.map(({ id, name, icon }) => ({
					id,
					name,
					kind: icon,
				})),
			})),
			devices: DeviceDTO.inHome(home.id).map((device) =>
				this.#deviceJson(device),
			),
		};
	}

	#registerReading(server: McpServer): void {
		server.registerTool(
			"list_homes",
			{
				title: "List homes",
				description:
					"The homes this server manages, each with an id; most have one.",
				annotations: { readOnlyHint: true },
			},
			() =>
				this.#reply({
					homes: HomeDTO.all().map((home) => home.toJSON()),
				}),
		);
		server.registerTool(
			"list_house",
			{
				title: "List the house",
				description:
					'A home: its floors and outside spaces with their rooms (each with an id), and every device with its id, kind, room (null for the whole house), last reading and error if it is unreachable. Room id "house" means the whole house. Without homeId, the first home.',
				inputSchema: z.object({ homeId: homeIdField }),
				annotations: { readOnlyHint: true },
			},
			({ homeId }) => {
				const home = this.#home(homeId);
				return home
					? this.#reply(this.house(home))
					: this.#failure("No home has that id. Call list_homes.");
			},
		);
		server.registerTool(
			"get_device",
			{
				title: "Get a device",
				description:
					"One device's kind, room, last reading and error, read by the server within the last two minutes.",
				inputSchema: z.object({ deviceId: deviceIdField }),
				annotations: { readOnlyHint: true },
			},
			({ deviceId }) => {
				const device = DeviceDTO.find(deviceId);
				return device
					? this.#reply(this.#deviceJson(device))
					: this.#failure("No device has that id. Call list_house.");
			},
		);
	}

	#registerCovers(server: McpServer): void {
		server.registerTool(
			"control_blind",
			{
				title: "Control a blind",
				description:
					"Opens, closes or stops a blind, or moves it to a position from 0 (closed) to 100 (open). Give either action or position.",
				inputSchema: z.object({
					deviceId: deviceIdField,
					action: z.enum(coverActions).optional(),
					position: z.number().int().min(0).max(100).optional(),
				}),
			},
			({ deviceId, action, position }) =>
				this.#withDevice(deviceId, async (device) => {
					if (action) {
						await devices.coverAction(device, action);
					} else if (position !== undefined) {
						await devices.coverPosition(device, position);
					} else {
						throw new Error("Give an action or a position.");
					}
					return { done: true };
				}),
		);
		server.registerTool(
			"control_room_blinds",
			{
				title: "Control every blind in a room",
				description:
					'Opens, closes or stops every blind in a room, "house" for the blinds that belong to the whole house. Reports each blind that failed.',
				inputSchema: z.object({
					homeId: homeIdField,
					roomId: z
						.string()
						.min(1)
						.describe('A room id from list_house, or "house".'),
					action: z.enum(coverActions),
				}),
			},
			async ({ homeId, roomId, action }) => {
				const home = this.#home(homeId);
				if (!home) {
					return this.#failure("No home has that id. Call list_homes.");
				}
				const covers = DeviceDTO.inRoom(
					home.id,
					roomId === wholeHouse ? null : roomId,
				).filter((device) => device.kind === "tuya-cover");
				const failed = await devices.coverGroup(covers, action);
				return this.#reply({ blinds: covers.length, failed });
			},
		);
	}

	#registerClimate(server: McpServer): void {
		server.registerTool(
			"control_heat_pump",
			{
				title: "Control a heat pump",
				description:
					"Turns a Mitsubishi heat pump on or off, sets its mode (air-to-air units only) or target temperature in half degrees, or boosts the hot water (air-to-water units with a tank). Returns the state MELCloud reports back.",
				inputSchema: z.object({
					deviceId: deviceIdField,
					power: z.boolean().optional(),
					mode: z.enum(climateModes).optional(),
					targetTemperature: z.number().min(5).max(35).optional(),
					hotWaterBoost: z.boolean().optional(),
				}),
			},
			({ deviceId, ...change }) =>
				this.#withDevice(deviceId, async (device) => {
					await devices.climate(device, change);
					return { state: DeviceDTO.find(device.id)?.state ?? null };
				}),
		);
	}

	#registerPrinter(server: McpServer): void {
		server.registerTool(
			"control_printer",
			{
				title: "Control a 3D printer",
				description:
					"Pauses, resumes or stops the print on a Bambu Lab printer, turns its chamber light on or off, or sets the print speed (1 silent, 2 standard, 3 sport, 4 ludicrous). Stopping can't be undone: confirm with the person first.",
				inputSchema: z.object({
					deviceId: deviceIdField,
					command: z.enum(printerCommands).optional(),
					light: z.boolean().optional(),
					speed: z.literal(printerSpeeds).optional(),
				}),
			},
			({ deviceId, ...change }) =>
				this.#withDevice(deviceId, async (device) => {
					await devices.printer(device, change);
					return { done: true };
				}),
		);
	}

	#registerVacuum(server: McpServer): void {
		server.registerTool(
			"control_vacuum",
			{
				title: "Control a robot vacuum",
				description:
					"Starts a full clean, pauses, stops, or sends a Dreame robot vacuum back to its dock.",
				inputSchema: z.object({
					deviceId: deviceIdField,
					command: z.enum(vacuumCommands),
				}),
			},
			({ deviceId, command }) =>
				this.#withDevice(deviceId, async (device) => {
					await devices.vacuum(device, command);
					return { done: true };
				}),
		);
	}

	#home(homeId: string | undefined): HomeDTO | undefined {
		return homeId === undefined ? HomeDTO.first() : HomeDTO.find(homeId);
	}

	async #withDevice(
		deviceId: string,
		work: (device: DeviceDTO) => Promise<unknown>,
	) {
		const device = DeviceDTO.find(deviceId);
		if (!device) {
			return this.#failure("No device has that id. Call list_house.");
		}
		try {
			return this.#reply(await work(device));
		} catch (error) {
			return this.#failure(devices.message(error));
		}
	}

	#deviceJson(device: DeviceDTO) {
		const { id, kind, name, roomId, state, stateError, stateAt } =
			device.toJSON();
		return {
			id,
			kind,
			name,
			roomId,
			state,
			error: stateError,
			readAt: stateAt?.toISOString() ?? null,
		};
	}

	async #verify(token: string, resource: URL): Promise<AuthInfo> {
		const claims = await verifyJwsAccessToken(token, {
			jwksFetch: () => authService.get().api.getJwks(),
			jwksCacheKey,
			verifyOptions: {
				issuer: `${resource.origin}/api/auth`,
				audience: resource.href,
			},
		}).catch(() => {
			throw new OAuthError(OAuthErrorCode.InvalidToken, "Sign in again.");
		});
		const userId = claims.sub;
		const clientId = typeof claims.azp === "string" ? claims.azp : undefined;
		if (!userId || !clientId || !AiAppDTO.allowed(userId, clientId)) {
			throw new OAuthError(OAuthErrorCode.InvalidToken, "Sign in again.");
		}
		return {
			token,
			clientId,
			scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [],
			expiresAt: claims.exp,
			resource,
			extra: { userId },
		};
	}

	#reply(value: unknown) {
		return {
			content: [{ type: "text" as const, text: JSON.stringify(value) }],
		};
	}

	#failure(message: string) {
		return {
			content: [{ type: "text" as const, text: message }],
			isError: true,
		};
	}
}

export const mcpEndpoint = new McpEndpoint();
