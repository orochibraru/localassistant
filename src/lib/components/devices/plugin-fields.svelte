<script lang="ts">
	import Picker from "#lib/components/picker.svelte";
	import ToggleChoice from "#lib/components/toggle-choice.svelte";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import type { PluginField, PluginValues } from "#lib/plugins.js";

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
</script>

{#each fields as field (field.name)}
	{@const id = `${prefix}-${field.name}`}
	{@const kept = field.type === "secret" && secretsSet.includes(field.name)}
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
	{:else}
		<Field.Field>
			<Field.Label for={id}>{field.label}</Field.Label>
			<Input
				{id}
				name={inputName(field)}
				value={field.type === "secret" ? "" : initial(field)}
				placeholder={kept ? "Unchanged" : field.placeholder}
				type={field.type === "secret" ? "password" : "text"}
				inputmode={field.type === "number"
					? "decimal"
					: field.keyboard === "decimal"
						? "decimal"
						: field.keyboard}
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
