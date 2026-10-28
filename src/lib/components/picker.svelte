<script lang="ts" module>
	import type { Component } from "svelte";

	export interface PickerOption {
		value: string;
		label: string;
		icon?: Component<{ class?: string }>;
		tint?: string;
		image?: string;
		emoji?: string;
	}

	export interface PickerSearch {
		placeholder: string;
		empty: string;
		creatable?: boolean;
	}
</script>

<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { MediaQuery } from "svelte/reactivity";

	import { Button } from "#lib/components/ui/button/index.js";
	import * as Command from "#lib/components/ui/command/index.js";
	import * as Drawer from "#lib/components/ui/drawer/index.js";
	import * as Popover from "#lib/components/ui/popover/index.js";
	import * as Select from "#lib/components/ui/select/index.js";
	import { cn } from "#lib/utils.js";

	interface Props {
		id: string;
		name: string;
		label: string;
		options: PickerOption[];
		value?: string;
		values?: string[];
		multiple?: boolean;
		placeholder?: string;
		search?: PickerSearch;
		clearLabel?: string;
		disabled?: boolean;
		onPick?: (value: string) => void;
	}

	let {
		id,
		name,
		label,
		options,
		value = $bindable(""),
		values = $bindable([]),
		multiple = false,
		placeholder = "Pick one",
		search,
		clearLabel,
		disabled = false,
		onPick,
	}: Props = $props();

	const desktop = new MediaQuery("(min-width: 768px)");
	const nested = Drawer.isInsideDrawer();

	let open = $state(false);
	let query = $state("");

	const chosen = $derived(multiple ? values : value ? [value] : []);
	const selected = $derived(
		options.filter((option) => chosen.includes(option.value)),
	);
	const summary = $derived(
		multiple
			? selected.map((option) => option.label).join(", ")
			: (selected[0]?.label ?? value),
	);
	const typed = $derived(query.trim());
	const canCreate = $derived(
		search?.creatable === true &&
			typed !== "" &&
			!options.some(
				(option) =>
					option.label.toLocaleLowerCase() === typed.toLocaleLowerCase(),
			),
	);
	const triggerClass =
		"border-input bg-background focus-visible:ring-ring/50 flex h-11 w-full items-center gap-2 rounded-md border px-3 text-left text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-60";

	function pick(next: string) {
		if (multiple) {
			values = values.includes(next)
				? values.filter((entry) => entry !== next)
				: [...values, next];
		} else {
			value = next;
			open = false;
			query = "";
		}
		onPick?.(next);
	}
</script>

{#snippet optionIcon(option: PickerOption)}
	{#if option.image}
		<img
			src={option.image}
			alt=""
			loading="lazy"
			class="size-6 shrink-0 rounded-md bg-white object-contain p-0.5"
		/>
	{:else if option.emoji}
		<span
			class="w-6 shrink-0 text-center text-lg leading-none"
			aria-hidden="true">{option.emoji}</span
		>
	{:else if option.icon && option.tint}
		<span
			class="category-tile flex size-6 shrink-0 items-center justify-center rounded-md"
			style={option.tint}
		>
			<option.icon class="size-3.5" />
		</span>
	{:else if option.icon}
		<option.icon />
	{/if}
{/snippet}

{#if multiple}
	{#each values as entry (entry)}
		<input type="hidden" {name} value={entry} />
	{/each}
{:else}
	<input type="hidden" {name} {value} />
{/if}

{#snippet summaryContent(chevron: boolean)}
	{#if !multiple && (selected[0]?.image || selected[0]?.emoji || (selected[0]?.icon && selected[0].tint))}
		{@render optionIcon(selected[0])}
	{:else if !multiple && selected[0]?.icon}
		{@const Icon = selected[0].icon}
		<Icon class="text-muted-foreground size-4 shrink-0" />
	{/if}
	<span
		class={cn(
			"min-w-0 flex-1 truncate",
			chosen.length === 0 && "text-muted-foreground",
		)}>{summary || placeholder}</span
	>
	{#if chevron}
		<ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" />
	{/if}
{/snippet}

{#snippet list(itemClass: string, touch: boolean)}
	{#if search}
		<Command.Input
			placeholder={search.placeholder}
			bind:value={query}
			wrapperClass={touch ? "px-0 pt-0 pb-3" : undefined}
			groupClass={touch
				? "h-12! rounded-xl! text-base *:data-[slot=input-group-addon]:pl-3!"
				: undefined}
			class={touch ? "text-base" : undefined}
		/>
	{/if}
	<Command.List class="max-h-[min(60dvh,20rem)] max-md:max-h-[55dvh]">
		{#if search && !canCreate}
			<Command.Empty>{search.empty}</Command.Empty>
		{/if}
		{#if canCreate}
			<Command.Item
				value="create:{typed}"
				forceMount
				onSelect={() => pick(typed)}
				class={itemClass}
			>
				<PlusIcon />
				Add "{typed}"
			</Command.Item>
		{/if}
		{#each options as option (option.value)}
			<Command.Item
				value={option.label}
				keywords={[option.value]}
				data-checked={chosen.includes(option.value)}
				onSelect={() => pick(option.value)}
				class={itemClass}
			>
				{@render optionIcon(option)}
				{option.label}
			</Command.Item>
		{/each}
		{#if clearLabel && chosen.length > 0 && typed === ""}
			<Command.Item
				value="clear"
				onSelect={() => {
					values = [];
					pick("");
				}}
				class={itemClass}
			>
				<XIcon />
				{clearLabel}
			</Command.Item>
		{/if}
	</Command.List>
{/snippet}

{#snippet drawerContent()}
	<Drawer.Content>
		<Drawer.Header class="px-5 text-left">
			<Drawer.Title>{label}</Drawer.Title>
		</Drawer.Header>
		<Command.Root class="bg-transparent px-3">
			{@render list("min-h-12 rounded-xl px-3 text-base", true)}
		</Command.Root>
		{#if multiple}
			<div class="px-4 pt-2">
				<Button class="h-12 w-full rounded-xl" onclick={() => (open = false)}>
					<CheckIcon />
					Done
				</Button>
			</div>
		{/if}
	</Drawer.Content>
{/snippet}

{#if !desktop.current}
	<button
		type="button"
		{id}
		{disabled}
		class={triggerClass}
		aria-haspopup="dialog"
		onclick={() => (open = true)}
	>
		{@render summaryContent(true)}
	</button>
	{#if nested}
		<Drawer.NestedRoot bind:open>{@render drawerContent()}</Drawer.NestedRoot>
	{:else}
		<Drawer.Root bind:open>{@render drawerContent()}</Drawer.Root>
	{/if}
{:else if !search && !multiple}
	<Select.Root
		type="single"
		{disabled}
		bind:value
		onValueChange={(next) => onPick?.(next)}
	>
		<Select.Trigger {id} class={cn(triggerClass, "data-[size=default]:h-11")}>
			{@render summaryContent(false)}
		</Select.Trigger>
		<Select.Content>
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label}>
					{@render optionIcon(option)}
					{option.label}
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
{:else}
	<Popover.Root bind:open>
		<Popover.Trigger {id} {disabled} class={triggerClass}>
			{@render summaryContent(true)}
		</Popover.Trigger>
		<Popover.Content
			align="start"
			class="w-(--bits-popover-anchor-width) min-w-64 rounded-xl p-0"
		>
			<Command.Root class="bg-transparent">
				{@render list("", false)}
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
{/if}
