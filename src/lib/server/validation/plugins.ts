import { z } from "zod";

import { cardSizes } from "#lib/devices.js";
import {
	pluginCards,
	type PluginField,
	pluginFieldTypes,
	pluginIcons,
	pluginInterpreters,
	type PluginManifest,
	pluginNeeds,
	pluginPlatforms,
	pluginRuntimes,
	type PluginValue,
	type PluginValues,
} from "#lib/plugins.js";

const reservedFields = new Set(["id", "name", "roomId", "plugin"]);

export const valuePrefix = "value:";

const text = (max: number) => z.string().trim().min(1).max(max);

const repositoryPath = z
	.string()
	.regex(/^[\w.-]+(\/[\w.-]+)*$/, "A file path inside the repository.")
	.refine(
		(path) => !path.split("/").includes(".."),
		"A file path inside the repository.",
	);

const fieldSchema = z
	.object({
		name: z
			.string()
			.regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/)
			.refine((name) => !reservedFields.has(name), "That field name is taken."),
		label: text(60),
		type: z.enum(pluginFieldTypes),
		description: text(400).optional(),
		placeholder: text(120).optional(),
		optional: z.boolean().optional(),
		default: z.union([z.string(), z.number(), z.boolean()]).optional(),
		choices: z
			.array(z.object({ value: text(60), label: text(60) }))
			.min(1)
			.max(30)
			.optional(),
		min: z.number().optional(),
		max: z.number().optional(),
		pattern: text(300)
			.refine((pattern) => {
				try {
					new RegExp(pattern);
					return true;
				} catch {
					return false;
				}
			}, "That pattern isn't a valid regular expression.")
			.optional(),
		message: text(200).optional(),
		keyboard: z.enum(["decimal", "url", "email"]).optional(),
	})
	.refine(
		(field) => field.type !== "choice" || field.choices !== undefined,
		"A choice field lists its choices.",
	);

const fieldsSchema = z
	.array(fieldSchema)
	.max(30)
	.refine(
		(fields) =>
			new Set(fields.map((field) => field.name)).size === fields.length,
		"Two fields share a name.",
	);

export const manifestSchema = z
	.object({
		id: z
			.string()
			.regex(
				/^[a-z][a-z0-9-]{1,39}$/,
				"The id is lowercase letters, digits and dashes.",
			),
		name: text(60),
		description: text(300),
		author: text(80).optional(),
		version: text(40),
		localassistant: z
			.string()
			.regex(/^\d+\.\d+\.\d+$/)
			.optional(),
		runtime: z.enum(pluginRuntimes).default("bun"),
		entry: z
			.union([
				repositoryPath,
				z.partialRecord(z.enum(pluginPlatforms), repositoryPath),
			])
			.default("dist/index.js"),
		interpreter: z.enum(pluginInterpreters).optional(),
		files: z.array(repositoryPath).max(30).default([]),
		icon: z.enum(pluginIcons).catch("puzzle"),
		needs: z.array(z.enum(pluginNeeds)).default([]),
		connection: z
			.object({
				description: text(600),
				connected: text(300),
				fields: fieldsSchema,
				find: text(40).optional(),
			})
			.optional(),
		device: z
			.object({
				title: text(60),
				description: text(600),
				fields: fieldsSchema,
				submit: text(40),
			})
			.optional(),
		automatic: text(600).optional(),
		kinds: z
			.array(
				z.object({
					id: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/),
					label: text(60),
					card: z.enum(pluginCards).exclude(["app"]),
					icon: z.enum(pluginIcons).catch("puzzle"),
					size: z.enum(cardSizes).optional(),
					order: z.number().int().min(-1).max(9).optional(),
					houseMeter: z.boolean().optional(),
					polled: z.boolean().optional(),
				}),
			)
			.min(1)
			.max(30),
	})
	.refine(
		(manifest) =>
			manifest.kinds.every(
				(kind) =>
					kind.id === manifest.id || kind.id.startsWith(`${manifest.id}-`),
			),
		{ message: "Every kind id starts with the plugin id.", path: ["kinds"] },
	)
	.refine(
		(manifest) =>
			manifest.runtime === "process" ||
			(typeof manifest.entry === "string" &&
				manifest.entry.endsWith(".js") &&
				!manifest.interpreter),
		{
			message: "A bun plugin's entry is one .js file, with no interpreter.",
			path: ["entry"],
		},
	)
	.refine(
		(manifest) => !manifest.interpreter || typeof manifest.entry === "string",
		{
			message: "An interpreted plugin has one entry script for every platform.",
			path: ["interpreter"],
		},
	);

/**
 * The manifest in `raw`, checked against what LocalAssistant understands.
 *
 * @throws When the manifest is missing a field or has one LocalAssistant can't use, saying which.
 */
export function parseManifest(raw: unknown): PluginManifest {
	const result = manifestSchema.safeParse(raw);
	if (!result.success) {
		const issue = result.error.issues[0];
		throw new Error(
			`Its localassistant-plugin.json is invalid${issue ? ` at ${issue.path.join(".") || "the top"}: ${issue.message}` : "."}`,
		);
	}
	return result.data;
}

function valueSchema(field: PluginField, keepSecrets: boolean) {
	const blank = (value: string | undefined) => !value || value.trim() === "";
	const missing = `Fill in ${field.label.toLowerCase()}.`;
	return z
		.string()
		.optional()
		.transform((raw, context): PluginValue | undefined => {
			if (field.type === "boolean") {
				return raw === "true" || raw === "on";
			}
			if (blank(raw)) {
				if (field.type === "secret" && keepSecrets) {
					return undefined;
				}
				if (field.default !== undefined) {
					return field.default;
				}
				if (!field.optional) {
					context.addIssue({ code: "custom", message: missing });
				}
				return undefined;
			}
			const value = (raw ?? "").trim();
			if (field.type === "number") {
				const number = Number(value);
				if (
					!Number.isFinite(number) ||
					(field.min !== undefined && number < field.min) ||
					(field.max !== undefined && number > field.max)
				) {
					context.addIssue({
						code: "custom",
						message:
							field.message ??
							(field.min !== undefined && field.max !== undefined
								? `Type a number from ${field.min} to ${field.max}.`
								: "Type a number."),
					});
				}
				return number;
			}
			if (
				field.type === "choice" &&
				!field.choices?.some((choice) => choice.value === value)
			) {
				context.addIssue({
					code: "custom",
					message: `Pick ${field.label.toLowerCase()}.`,
				});
			}
			if (value.length > 2000) {
				context.addIssue({ code: "custom", message: "That's too long." });
			}
			if (field.pattern && !new RegExp(field.pattern).test(value)) {
				context.addIssue({
					code: "custom",
					message: field.message ?? `Check ${field.label.toLowerCase()}.`,
				});
			}
			return value;
		});
}

/** A form schema for `fields`, read from inputs named `value:<name>`, giving the values typed; empty secrets are left out when `keepSecrets`. */
export function valuesSchema(fields: PluginField[], keepSecrets: boolean) {
	return z
		.object(
			Object.fromEntries(
				fields.map((field) => [
					`${valuePrefix}${field.name}`,
					valueSchema(field, keepSecrets),
				]),
			),
		)
		.transform((parsed) => {
			const values: PluginValues = {};
			for (const field of fields) {
				const value = parsed[`${valuePrefix}${field.name}`];
				if (value !== undefined) {
					values[field.name] = value;
				}
			}
			return values;
		});
}

const roomId = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value && value !== "house" ? value : null));

const deviceName = z.string().trim().min(1, "Name the device.").max(60);

export const pluginIdSchema = z.object({ plugin: z.string().trim().min(1) });

/** The schema of a plugin's add-a-device form: name, room and its own fields. */
export function addDeviceSchema(fields: PluginField[]) {
	return z.intersection(
		z.object({ plugin: z.string().trim().min(1), name: deviceName, roomId }),
		valuesSchema(fields, false).transform((values) => ({ values })),
	);
}

/** The schema of a device's settings form: name, room and its plugin's fields, empty secrets kept. */
export function editDeviceSchema(fields: PluginField[]) {
	return z.intersection(
		z.object({ id: z.string().trim().min(1), name: deviceName, roomId }),
		valuesSchema(fields, true).transform((values) => ({ values })),
	);
}

/** The schema of a plugin's connection form: its own fields, empty secrets kept when it's already connected. */
export function connectionSchema(fields: PluginField[], keepSecrets: boolean) {
	return z.intersection(
		pluginIdSchema,
		valuesSchema(fields, keepSecrets).transform((values) => ({ values })),
	);
}

export const pluginLinkSchema = z.object({
	link: z
		.string()
		.trim()
		.min(3, "Paste the link to the integration.")
		.max(300, "That link is too long."),
});

export const brokerSchema = z.object({
	url: z
		.string()
		.trim()
		.regex(
			/^mqtts?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/,
			"Type the broker's address, like mqtt://192.168.1.10:1883.",
		),
	username: z
		.string()
		.trim()
		.max(100)
		.optional()
		.transform((value) => value || null),
	password: z
		.string()
		.max(200)
		.optional()
		.transform((value) => value || undefined),
});

export const gitHubTokenSchema = z.object({
	token: z
		.string()
		.trim()
		.regex(
			/^(github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,250}$/,
			"Paste a GitHub token: it starts with github_pat_ or ghp_.",
		),
});
