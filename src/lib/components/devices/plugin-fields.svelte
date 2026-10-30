<script lang="ts">
	import Picker from "#lib/components/picker.svelte";
	import ToggleChoice from "#lib/components/toggle-choice.svelte";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import {
		isSecretField,
		type PluginField,
		type PluginValues,
	} from "#lib/plugins.js";

	interface Props {
		prefix: string;
		fields: PluginField[];
		values: PluginValues;
		secretsSet: string[];
		errors: Record<string, string[]>;
	}

	const { prefix, fields, values, secretsSet, errors }: Props = $props();

	const inputName = (field: PluginField) => `value:${field.name}`;
	const errorsOf = (field: PluginField) =>
		errors[inputName(field)]?.map((message) => ({ message }));
	const initial = (field: PluginField) =>
		String(values[field.name] ?? field.default ?? "");

	const choices = $state<Record<string, string>>({});

	const typed = (field: PluginField) =>
		field.type === "url" || field.keyboard === "url"
			? "url"
			: field.keyboard === "email"
				? "email"
				: field.type === "secret"
					? "password"
					: "text";
	const plain = (field: PluginField) =>
		field.type === "url" ||
		field.type === "secret" ||
		field.keyboard === "url" ||
		field.keyboard === "email";
</script>

{#each fields as field (field.name)}
	{@const id = `${prefix}-${field.name}`}
	{@const kept = isSecretField(field) && secretsSet.includes(field.name)}
	{#if field.type === "boolean"}
		<Field.Field orientation="horizontal">
			<Checkbox
				{id}
				name={inputName(field)}
				value="true"
				checked={(values[field.name] ?? field.default) === true}
			/>
			<Field.Label for={id}>{field.label}</Field.Label>
			<Field.Error errors={errorsOf(field)} />
		</Field.Field>
	{:else if field.type === "choice" && field.choices && field.choices.length <= 7}
		<Field.Field>
			<Field.Label id="{id}-label">{field.label}</Field.Label>
			<input
				type="hidden"
				name={inputName(field)}
				value={choices[field.name] ?? initial(field)}
			/>
			<ToggleGroup.Root
				type="single"
				value={choices[field.name] ?? initial(field)}
				onValueChange={(next) => {
					if (next) {
						choices[field.name] = next;
					}
				}}
				spacing={2}
				aria-labelledby="{id}-label"
				class="w-full"
			>
				{#each field.choices as choice (choice.value)}
					<ToggleChoice
						value={choice.value}
						label={choice.label}
						class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 rounded-xl"
					/>
				{/each}
			</ToggleGroup.Root>
			{#if field.description}
				<Field.Description>{field.description}</Field.Description>
			{/if}
			<Field.Error errors={errorsOf(field)} />
		</Field.Field>
	{:else if field.type === "choice"}
		<Field.Field>
			<Field.Label for={id}>{field.label}</Field.Label>
			<Picker
				{id}
				name={inputName(field)}
				label={field.label}
				options={field.choices ?? []}
				value={initial(field)}
			/>
			{#if field.description}
				<Field.Description>{field.description}</Field.Description>
			{/if}
			<Field.Error errors={errorsOf(field)} />
		</Field.Field>
	{:else if field.type === "headers"}
		<Field.Field>
			<Field.Label for={id}>{field.label}</Field.Label>
			<Textarea
				{id}
				name={inputName(field)}
				placeholder={kept
					? "Unchanged"
					: (field.placeholder ?? "X-Api-Key: secret")}
				autocomplete="off"
				autocapitalize="none"
				spellcheck={false}
				rows={2}
				class="min-h-20 font-mono text-sm"
			/>
			<Field.Description
				>{[
					field.description,
					"One Name: value per line, stored encrypted.",
					kept ? "Leave empty to keep." : null,
				]
					.filter(Boolean)
					.join(" ")}</Field.Description
			>
			<Field.Error errors={errorsOf(field)} />
		</Field.Field>
	{:else}
		<Field.Field>
			<Field.Label for={id}>{field.label}</Field.Label>
			<Input
				{id}
				name={inputName(field)}
				value={field.type === "secret" ? "" : initial(field)}
				placeholder={kept ? "Unchanged" : field.placeholder}
				type={typed(field)}
				inputmode={field.type === "number"
					? "decimal"
					: field.type === "url"
						? "url"
						: field.keyboard}
				autocapitalize={plain(field) ? "none" : undefined}
				autocorrect={plain(field) ? "off" : undefined}
				spellcheck={plain(field) ? false : undefined}
				autocomplete="off"
				required={!field.optional && !kept && field.default === undefined}
				class="h-11"
			/>
			{#if field.description || kept}
				<Field.Description
					>{[field.description, kept ? "Leave empty to keep." : null]
						.filter(Boolean)
						.join(" ")}</Field.Description
				>
			{/if}
			<Field.Error errors={errorsOf(field)} />
		</Field.Field>
	{/if}
{/each}
