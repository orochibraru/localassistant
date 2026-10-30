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
	mediaActions,
	printerCommands,
	printerSpeeds,
	vacuumCommands,
} from "#lib/devices.js";
import { AiAppDTO } from "#lib/dto/ai-app.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import { FloorDTO } from "#lib/dto/floor.js";
import { HomeDTO } from "#lib/dto/home.js";
import { RoomDTO } from "#lib/dto/room.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { getSetting } from "#lib/dto/setting.js";
import { houseGroups } from "#lib/house.js";
import type { DeviceCommand } from "#lib/plugin-sdk.js";
import { kindInfo } from "#lib/plugins.js";
import { authService } from "#lib/server/auth/auth.js";
import { library } from "#lib/server/automations/library.js";
import { scenes } from "#lib/server/automations/scenes.js";
import { configuration } from "#lib/server/core/config.js";
import { devices } from "#lib/server/devices/devices.js";
import { plugins } from "#lib/server/plugins/registry.js";
import { automationSchema } from "#lib/server/validation/automation.js";
import { sceneSchema } from "#lib/server/validation/scene.js";

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
		this.#registerControls(server);
		this.#registerScenes(server);
		this.#registerSceneEditing(server);
		this.#registerRoutines(server);
		return server;
	}

	/** Whether AI apps and the in-app assistant may see and drive `device`: an admin can hide it. */
	visible(device: DeviceDTO): boolean {
		return !getSetting("aiHiddenDevices").includes(device.id);
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
			devices: DeviceDTO.inHome(home.id)
				.filter((device) => this.visible(device))
				.map((device) => this.#deviceJson(device)),
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
				return device && this.visible(device)
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
						await devices.command(device, { type: "cover", move: { action } });
					} else if (position !== undefined) {
						await devices.command(device, {
							type: "cover",
							move: { position },
						});
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
				).filter((device) => this.visible(device));
				const failed = await devices.coverGroup(covers, action);
				const blinds = covers.filter(
					(device) => kindInfo(plugins.catalog(), device.kind).card === "cover",
				).length;
				return this.#reply({ blinds, failed });
			},
		);
	}

	#registerClimate(server: McpServer): void {
		server.registerTool(
			"control_heat_pump",
			{
				title: "Control a heat pump",
				description:
					"Turns a heat pump or air conditioner on or off, sets its mode or target temperature in half degrees, or boosts the hot water (air-to-water units with a tank). Returns the state the unit reports back.",
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
					await devices.command(device, { type: "climate", change });
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
					"Pauses, resumes or stops the print on a 3D printer, turns its chamber light on or off, or sets the print speed (1 silent, 2 standard, 3 sport, 4 ludicrous). Stopping can't be undone: confirm with the person first.",
				inputSchema: z.object({
					deviceId: deviceIdField,
					command: z.enum(printerCommands).optional(),
					light: z.boolean().optional(),
					speed: z.literal(printerSpeeds).optional(),
				}),
			},
			({ deviceId, ...change }) =>
				this.#withDevice(deviceId, async (device) => {
					await devices.command(device, { type: "printer", change });
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
					"Starts a full clean, pauses, stops, or sends a robot vacuum back to its dock.",
				inputSchema: z.object({
					deviceId: deviceIdField,
					command: z.enum(vacuumCommands),
				}),
			},
			({ deviceId, command }) =>
				this.#withDevice(deviceId, async (device) => {
					await devices.command(device, {
						type: "vacuum",
						change: { command },
					});
					return { done: true };
				}),
		);
	}

	#registerControls(server: McpServer): void {
		const percent = z.number().min(0).max(100);
		this.#registerCommand(
			server,
			"control_switch",
			"Turn a switch on or off",
			"Turns a relay, plug or switch on or off.",
			{ on: z.boolean() },
			({ on }) => ({ type: "switch", on }),
		);
		this.#registerCommand(
			server,
			"control_light",
			"Control a light",
			"Turns a light on or off and sets its brightness (0 to 100), colour temperature in kelvin, or colour as a hue (0 to 360) and saturation (0 to 100), when it has them.",
			{
				on: z.boolean().optional(),
				brightness: percent.optional(),
				temperature: z.number().int().min(1000).max(10_000).optional(),
				color: z
					.object({ hue: z.number().min(0).max(360), saturation: percent })
					.optional(),
			},
			(change) => ({ type: "light", change }),
		);
		this.#registerCommand(
			server,
			"control_lock",
			"Lock or unlock a door",
			"Locks or unlocks a door lock.",
			{ locked: z.boolean() },
			({ locked }) => ({ type: "lock", locked }),
		);
		this.#registerCommand(
			server,
			"control_fan",
			"Control a fan",
			"Turns a fan on or off, sets its speed (0 to 100) or its oscillation.",
			{
				on: z.boolean().optional(),
				speed: percent.optional(),
				oscillating: z.boolean().optional(),
			},
			(change) => ({ type: "fan", change }),
		);
		this.#registerCommand(
			server,
			"control_media",
			"Control a speaker or TV",
			"Turns a speaker or TV on or off, plays, pauses, skips, sets the volume (0 to 100), mutes, or picks a source from its list.",
			{
				power: z.boolean().optional(),
				action: z.enum(mediaActions).optional(),
				volume: percent.optional(),
				muted: z.boolean().optional(),
				source: z.string().min(1).max(120).optional(),
			},
			(change) => ({ type: "media", change }),
		);
		this.#registerCommand(
			server,
			"press_button",
			"Press a button or run a scene",
			"Presses a button, or runs a scene or script, once.",
			{},
			() => ({ type: "button" }),
		);
	}

	#registerCommand<Shape extends z.ZodRawShape>(
		server: McpServer,
		name: string,
		title: string,
		description: string,
		shape: Shape,
		toCommand: (input: z.infer<z.ZodObject<Shape>>) => DeviceCommand,
	): void {
		const schema = z.object(shape);
		server.registerTool(
			name,
			{
				title,
				description,
				inputSchema: schema.extend({ deviceId: deviceIdField }),
			},
			(input: Record<string, unknown>) => {
				const { deviceId, ...rest } = input;
				return this.#withDevice(String(deviceId), async (device) => {
					await devices.command(device, toCommand(schema.parse(rest)));
					return { done: true };
				});
			},
		);
	}

	#registerScenes(server: McpServer): void {
		server.registerTool(
			"list_scenes",
			{
				title: "List scenes",
				description:
					"A home's scenes, each with an id, a name and the devices it sets. Without homeId, the first home.",
				inputSchema: z.object({ homeId: homeIdField }),
				annotations: { readOnlyHint: true },
			},
			({ homeId }) => {
				const home = this.#home(homeId);
				return home
					? this.#reply({
							scenes: SceneDTO.inHome(home.id).map((scene) => scene.toJSON()),
						})
					: this.#failure("No home has that id. Call list_homes.");
			},
		);
		server.registerTool(
			"set_scene",
			{
				title: "Set a scene",
				description:
					"Sets a scene: every device in it goes the way the scene says. Get the id from list_scenes.",
				inputSchema: z.object({ sceneId: z.string().min(1) }),
			},
			async ({ sceneId }) => {
				const scene = SceneDTO.find(sceneId);
				if (!scene) {
					return this.#failure("No scene has that id. Call list_scenes.");
				}
				const failures = await scenes.activate(scene);
				return failures.length > 0
					? this.#failure(failures.join(" "))
					: this.#reply({ done: true });
			},
		);
	}

	#registerSceneEditing(server: McpServer): void {
		server.registerTool(
			"save_scene",
			{
				title: "Create or change a scene",
				description:
					"Saves a scene: a name and the command each device gets when it's set, shaped like control_device's commands. Pass sceneId to replace that scene, leave it out to create one. Read list_house for device ids and list_scenes first to avoid duplicates.",
				inputSchema: z.object({
					homeId: homeIdField,
					sceneId: z.string().min(1).optional(),
					scene: sceneSchema,
				}),
			},
			({ homeId, sceneId, scene }) =>
				this.#editing(homeId, sceneId, SceneDTO, (home) => {
					this.refuseHidden(scene.members.map((member) => member.deviceId));
					return {
						scene: library.saveScene(home.id, sceneId, scene).toJSON(),
					};
				}),
		);
		server.registerTool(
			"delete_scene",
			{
				title: "Delete a scene",
				description:
					"Deletes a scene for everyone. Routines that set it stop working, so confirm with the person first.",
				inputSchema: z.object({ sceneId: z.string().min(1) }),
				annotations: { destructiveHint: true },
			},
			({ sceneId }) =>
				this.#editing(undefined, sceneId, SceneDTO, (home) => ({
					deleted: library.removeScene(home.id, sceneId),
				})),
		);
	}

	#registerRoutines(server: McpServer): void {
		server.registerTool(
			"list_routines",
			{
				title: "List routines",
				description:
					"A home's routines: each with an id, a name, whether it's on, its trigger, period, conditions and actions. Without homeId, the first home.",
				inputSchema: z.object({ homeId: homeIdField }),
				annotations: { readOnlyHint: true },
			},
			({ homeId }) => {
				const home = this.#home(homeId);
				return home
					? this.#reply({
							routines: AutomationDTO.inHome(home.id).map((automation) =>
								this.routineJson(automation),
							),
						})
					: this.#failure("No home has that id. Call list_homes.");
			},
		);
		server.registerTool(
			"save_routine",
			{
				title: "Create or change a routine",
				description:
					"Saves a routine the server runs on its own: a trigger (sun, time, temperature, contact, device state or presence), a period, optional conditions and one to twenty actions (devices, blinds, scenes, delays, notifications). Pass routineId to replace that routine, leave it out to create one. Read list_routines and list_house first; say what it will do before saving.",
				inputSchema: z.object({
					homeId: homeIdField,
					routineId: z.string().min(1).optional(),
					routine: automationSchema,
				}),
			},
			({ homeId, routineId, routine }) =>
				this.#editing(homeId, routineId, AutomationDTO, (home) => {
					this.refuseHidden(library.devicesOf(routine));
					return {
						routine: this.routineJson(
							library.saveRoutine(home.id, routineId, routine),
						),
					};
				}),
		);
		server.registerTool(
			"set_routine_enabled",
			{
				title: "Turn a routine on or off",
				description:
					"Turns a routine on or off. Get the id from list_routines.",
				inputSchema: z.object({
					routineId: z.string().min(1),
					enabled: z.boolean(),
				}),
			},
			({ routineId, enabled }) =>
				this.#editing(undefined, routineId, AutomationDTO, (home) => {
					library.enableRoutine(home.id, routineId, enabled);
					return { enabled };
				}),
		);
		server.registerTool(
			"run_routine",
			{
				title: "Run a routine now",
				description:
					"Runs a routine's actions now, whatever its trigger and conditions. The server runs it in the background.",
				inputSchema: z.object({ routineId: z.string().min(1) }),
			},
			({ routineId }) =>
				this.#editing(undefined, routineId, AutomationDTO, (home) => {
					library.runRoutine(home.id, routineId);
					return { started: true };
				}),
		);
		server.registerTool(
			"delete_routine",
			{
				title: "Delete a routine",
				description:
					"Deletes a routine and its history for everyone. Confirm with the person first.",
				inputSchema: z.object({ routineId: z.string().min(1) }),
				annotations: { destructiveHint: true },
			},
			({ routineId }) =>
				this.#editing(undefined, routineId, AutomationDTO, (home) => ({
					deleted: library.removeRoutine(home.id, routineId),
				})),
		);
	}

	#editing(
		homeId: string | undefined,
		id: string | undefined,
		owner: { find(id: string): { homeId: string } | undefined },
		work: (home: HomeDTO) => unknown,
	) {
		const existingHome = id ? owner.find(id)?.homeId : undefined;
		if (id && !existingHome) {
			return this.#failure("Nothing has that id. List them again.");
		}
		const home = existingHome ? HomeDTO.find(existingHome) : this.#home(homeId);
		if (!home) {
			return this.#failure("No home has that id. Call list_homes.");
		}
		try {
			return this.#reply(work(home));
		} catch (error) {
			return this.#failure(devices.message(error));
		}
	}

	/**
	 * Refuses device ids an admin hid from AI, as if they didn't exist.
	 *
	 * @throws When one of `deviceIds` is hidden.
	 */
	refuseHidden(deviceIds: string[]): void {
		for (const deviceId of deviceIds) {
			const device = DeviceDTO.find(deviceId);
			if (device && !this.visible(device)) {
				throw new Error(`No device has the id ${deviceId}. Call list_house.`);
			}
		}
	}

	/** A routine as AI sees it: its id, name, whether it's on, and what triggers it and what it does. */
	routineJson(automation: AutomationDTO) {
		const { id, name, enabled, trigger, period, conditions, actions } =
			automation.toJSON();
		return { id, name, enabled, trigger, period, conditions, actions };
	}

	#home(homeId: string | undefined): HomeDTO | undefined {
		return homeId === undefined ? HomeDTO.first() : HomeDTO.find(homeId);
	}

	async #withDevice(
		deviceId: string,
		work: (device: DeviceDTO) => Promise<unknown>,
	) {
		const device = DeviceDTO.find(deviceId);
		if (!device || !this.visible(device)) {
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
