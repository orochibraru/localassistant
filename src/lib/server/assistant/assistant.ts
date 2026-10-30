import Anthropic from "@anthropic-ai/sdk";
import { error } from "@sveltejs/kit";
import { z } from "zod";

import type { AssistantTurn } from "#lib/assistant.js";
import { describeCommand } from "#lib/automations.js";
import { AutomationDTO } from "#lib/dto/automation.js";
import { DeviceDTO } from "#lib/dto/device.js";
import type { HomeDTO } from "#lib/dto/home.js";
import { SceneDTO } from "#lib/dto/scene.js";
import { getSetting } from "#lib/dto/setting.js";
import { library } from "#lib/server/automations/library.js";
import { scenes } from "#lib/server/automations/scenes.js";
import { Logger } from "#lib/server/core/logger.js";
import { secrets } from "#lib/server/core/secrets.js";
import { devices } from "#lib/server/devices/devices.js";
import { mcpEndpoint } from "#lib/server/mcp/server.js";
import {
	automationSchema,
	deviceCommandSchema,
} from "#lib/server/validation/automation.js";
import { sceneSchema } from "#lib/server/validation/scene.js";

const logger = new Logger("Assistant");
const model = "claude-opus-5-5";
const longestLoop = 8;

const instructions = `You are the assistant built into LocalAssistant, a self-hosted smart home app for one household. You talk with a person signed in to it.
Answer from the house as get_house reports it, never from guesses: call it before talking about devices, rooms or scenes. To change something, call control_device or set_scene, then say in one short sentence what you did, or what failed and why.
You can also create, change, turn off, run and delete routines and scenes: call list_routines first, say what a new or changed one will do, and ask before deleting one.
Keep replies short and plain, in the language the person writes in. When a request is ambiguous (two lamps match "the lamp"), ask which one instead of picking. Never claim a device changed unless the tool said so.`;

const controlInput = z.object({
	deviceId: z.string().min(1),
	command: deviceCommandSchema,
});
const sceneInput = z.object({ sceneId: z.string().min(1) });
const routineInput = z.object({ routineId: z.string().min(1) });
const enableInput = routineInput.extend({ enabled: z.boolean() });
const saveRoutineInput = z.object({
	routineId: z.string().min(1).optional(),
	routine: automationSchema,
});
const saveSceneInput = z.object({
	sceneId: z.string().min(1).optional(),
	scene: sceneSchema,
});

function inputSchema(
	schema: z.ZodType,
): Anthropic.Beta.BetaTool["input_schema"] {
	const { $schema: _schema, ...rest } = z.toJSONSchema(schema) as Record<
		string,
		unknown
	>;
	return { ...rest, type: "object" };
}

const tools: Anthropic.Beta.BetaTool[] = [
	{
		name: "get_house",
		description:
			"The household: its floors and rooms, every device it may show you with its kind, room and last reading, and its scenes. Call it first.",
		input_schema: { type: "object", properties: {} },
	},
	{
		name: "control_device",
		description:
			"Sends one command to one device: switch on, light change (brightness 0-100, temperature in kelvin, colour hue/saturation), lock, fan, media, cover move, climate change, valve target, button press, printer or vacuum command. The command's type must match the device's card.",
		input_schema: inputSchema(controlInput),
	},
	{
		name: "set_scene",
		description: "Sets a scene: every device in it goes the way it says.",
		input_schema: inputSchema(sceneInput),
	},
	{
		name: "list_routines",
		description:
			"The home's routines with their id, name, whether they're on, trigger, period, conditions and actions, and the scenes with what each sets.",
		input_schema: { type: "object", properties: {} },
	},
	{
		name: "save_routine",
		description:
			"Creates a routine the server runs on its own, or replaces routineId. Read list_routines and get_house first, and say what it will do before saving.",
		input_schema: inputSchema(saveRoutineInput),
	},
	{
		name: "set_routine_enabled",
		description: "Turns a routine on or off.",
		input_schema: inputSchema(enableInput),
	},
	{
		name: "run_routine",
		description: "Runs a routine's actions now, whatever its trigger.",
		input_schema: inputSchema(routineInput),
	},
	{
		name: "delete_routine",
		description: "Deletes a routine for everyone. Ask first.",
		input_schema: inputSchema(routineInput),
	},
	{
		name: "save_scene",
		description:
			"Creates a scene, a name and the command each device gets, or replaces sceneId.",
		input_schema: inputSchema(saveSceneInput),
	},
	{
		name: "delete_scene",
		description: "Deletes a scene for everyone. Ask first.",
		input_schema: inputSchema(sceneInput),
	},
];

export interface AssistantReply {
	text: string;
	actions: string[];
}

/** The in-app assistant: Claude, with tools that read the house and drive what admins let AI see. */
class Assistant {
	/** Whether an admin saved an API key for it. */
	configured(): boolean {
		return getSetting("assistant") !== null;
	}

	/**
	 * Checks `apiKey` with the Claude API by looking up the model the assistant uses.
	 *
	 * @throws When the key is refused or the API can't be reached.
	 */
	async check(apiKey: string): Promise<void> {
		await new Anthropic({ apiKey }).models.retrieve(model);
	}

	/**
	 * A client for the Claude API with the stored key.
	 *
	 * @throws When no key is saved.
	 */
	client(): Anthropic {
		const stored = getSetting("assistant");
		if (!stored) {
			throw new Error("An admin has to add a Claude API key first.");
		}
		return new Anthropic({ apiKey: secrets.decrypt(stored.encryptedApiKey) });
	}

	/**
	 * Like `reply`, for a request: what went wrong becomes an HTTP error with a message fit for the person asking.
	 *
	 * @throws A 409 error with no key saved, a 502 or 503 one when the Claude API refuses or can't be reached.
	 */
	async answer(
		home: HomeDTO,
		history: AssistantTurn[],
	): Promise<AssistantReply> {
		if (!this.configured()) {
			error(409, "An admin has to add a Claude API key first, in Admin, AI.");
		}
		try {
			return await this.reply(home, history);
		} catch (failure) {
			if (failure instanceof Anthropic.AuthenticationError) {
				error(
					502,
					"The Claude API refused the key: an admin has to replace it.",
				);
			}
			if (failure instanceof Anthropic.RateLimitError) {
				error(503, "The Claude API is busy right now. Try again in a minute.");
			}
			logger.warn("The assistant failed", undefined, failure);
			error(502, "The Claude API can't be reached right now.");
		}
	}

	/**
	 * Answers the last turn of `history` in `home`, running the tools it asks for; returns its reply and what it did.
	 *
	 * @throws When no key is saved, or the Claude API refuses or can't be reached.
	 */
	async reply(
		home: HomeDTO,
		history: AssistantTurn[],
	): Promise<AssistantReply> {
		const client = this.client();
		const messages: Anthropic.Beta.BetaMessageParam[] = history.map((turn) => ({
			role: turn.role,
			content: turn.text,
		}));
		const actions: string[] = [];
		for (let step = 0; step < longestLoop; step += 1) {
			const response = await client.beta.messages.create({
				model,
				max_tokens: 16_000,
				betas: ["server-side-fallback-2026-07-01"],
				fallbacks: "default",
				output_config: { effort: "low" },
				system: instructions,
				tools,
				messages,
			});
			if (response.stop_reason === "refusal") {
				return { text: "I can't help with that one.", actions };
			}
			const calls = response.content.filter(
				(block): block is Anthropic.Beta.BetaToolUseBlock =>
					block.type === "tool_use",
			);
			if (response.stop_reason !== "tool_use" || calls.length === 0) {
				return { text: this.#text(response.content), actions };
			}
			messages.push({ role: "assistant", content: response.content });
			const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
			for (const call of calls) {
				const outcome = await this.run(home, call.name, call.input);
				if (outcome.action) {
					actions.push(outcome.action);
				}
				results.push({
					type: "tool_result",
					tool_use_id: call.id,
					content: outcome.content,
					...(outcome.error ? { is_error: true } : {}),
				});
			}
			messages.push({ role: "user", content: results });
		}
		return {
			text: "That took too many steps. Try asking for one thing at a time.",
			actions,
		};
	}

	/** Runs one tool call in `home`, as the assistant asked; never throws, a failure comes back as its result. */
	async run(
		home: HomeDTO,
		name: string,
		input: unknown,
	): Promise<{ content: string; error?: boolean; action?: string }> {
		if (name === "get_house") {
			return {
				content: JSON.stringify({
					...mcpEndpoint.house(home),
					scenes: SceneDTO.inHome(home.id).map((scene) => ({
						id: scene.id,
						name: scene.name,
					})),
				}),
			};
		}
		if (name === "set_scene") {
			const parsed = sceneInput.safeParse(input);
			const scene = parsed.success
				? SceneDTO.find(parsed.data.sceneId, home.id)
				: undefined;
			if (!scene) {
				return { content: "No scene has that id.", error: true };
			}
			const failures = await scenes.activate(scene);
			return failures.length > 0
				? { content: failures.join(" "), error: true }
				: { content: "Done.", action: `Set ${scene.name}` };
		}
		if (name === "control_device") {
			const parsed = controlInput.safeParse(input);
			if (!parsed.success) {
				return { content: "That command isn't valid.", error: true };
			}
			const device = DeviceDTO.find(parsed.data.deviceId, home.id);
			if (!device || !mcpEndpoint.visible(device)) {
				return { content: "No device has that id.", error: true };
			}
			try {
				await devices.command(device, parsed.data.command);
			} catch (failure) {
				return { content: devices.message(failure), error: true };
			}
			return {
				content: "Done.",
				action: describeCommand(parsed.data.command, device.toJSON().name),
			};
		}
		return this.#edit(home, name, input);
	}

	#edit(
		home: HomeDTO,
		name: string,
		input: unknown,
	): { content: string; error?: boolean; action?: string } {
		try {
			if (name === "list_routines") {
				return {
					content: JSON.stringify({
						routines: AutomationDTO.inHome(home.id).map((automation) =>
							mcpEndpoint.routineJson(automation),
						),
						scenes: SceneDTO.inHome(home.id).map((scene) => scene.toJSON()),
					}),
				};
			}
			if (name === "save_routine") {
				const { routineId, routine } = saveRoutineInput.parse(input);
				mcpEndpoint.refuseHidden(library.devicesOf(routine));
				const saved = library.saveRoutine(home.id, routineId, routine);
				return {
					content: JSON.stringify(mcpEndpoint.routineJson(saved)),
					action: `Saved the routine ${saved.name}`,
				};
			}
			if (name === "set_routine_enabled") {
				const { routineId, enabled } = enableInput.parse(input);
				library.enableRoutine(home.id, routineId, enabled);
				return {
					content: "Done.",
					action: enabled ? "Turned a routine on" : "Turned a routine off",
				};
			}
			if (name === "run_routine") {
				library.runRoutine(home.id, routineInput.parse(input).routineId);
				return { content: "Started.", action: "Ran a routine" };
			}
			if (name === "delete_routine") {
				const deleted = library.removeRoutine(
					home.id,
					routineInput.parse(input).routineId,
				);
				return deleted
					? { content: "Deleted.", action: "Deleted a routine" }
					: { content: "No routine has that id.", error: true };
			}
			if (name === "save_scene") {
				const { sceneId, scene } = saveSceneInput.parse(input);
				mcpEndpoint.refuseHidden(
					scene.members.map((member) => member.deviceId),
				);
				const saved = library.saveScene(home.id, sceneId, scene);
				return {
					content: JSON.stringify(saved.toJSON()),
					action: `Saved the scene ${saved.name}`,
				};
			}
			if (name === "delete_scene") {
				const deleted = library.removeScene(
					home.id,
					sceneInput.parse(input).sceneId,
				);
				return deleted
					? { content: "Deleted.", action: "Deleted a scene" }
					: { content: "No scene has that id.", error: true };
			}
		} catch (failure) {
			return {
				content:
					failure instanceof z.ZodError
						? `That input isn't valid: ${failure.issues[0]?.message ?? "check it"}.`
						: devices.message(failure),
				error: true,
			};
		}
		return { content: `There's no tool called ${name}.`, error: true };
	}

	#text(content: Anthropic.Beta.BetaContentBlock[]): string {
		return (
			content
				.flatMap((block) => (block.type === "text" ? [block.text] : []))
				.join("\n")
				.trim() || "Done."
		);
	}
}

export const assistant = new Assistant();
