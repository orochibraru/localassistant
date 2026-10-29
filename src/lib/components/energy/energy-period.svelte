<script lang="ts">
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import Calendar1Icon from "@lucide/svelte/icons/calendar-1";
	import CalendarArrowUpIcon from "@lucide/svelte/icons/calendar-arrow-up";
	import CalendarCheckIcon from "@lucide/svelte/icons/calendar-check";
	import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
	import CalendarCogIcon from "@lucide/svelte/icons/calendar-cog";
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import CalendarFoldIcon from "@lucide/svelte/icons/calendar-fold";
	import CalendarMinusIcon from "@lucide/svelte/icons/calendar-minus";
	import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";
	import CalendarSearchIcon from "@lucide/svelte/icons/calendar-search";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import Flower2Icon from "@lucide/svelte/icons/flower-2";
	import InfinityIcon from "@lucide/svelte/icons/infinity";
	import LeafIcon from "@lucide/svelte/icons/leaf";
	import SnowflakeIcon from "@lucide/svelte/icons/snowflake";
	import SunIcon from "@lucide/svelte/icons/sun";
	import type { Component } from "svelte";
	import { MediaQuery } from "svelte/reactivity";

	import { Button } from "#lib/components/ui/button/index.js";
	import * as Drawer from "#lib/components/ui/drawer/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import {
		type EnergyPreset,
		energyPresetLabels,
		type EnergyRange,
		type EnergySeason,
		monthName,
		rangeLabel,
	} from "#lib/energy.js";

	interface Props {
		range: EnergyRange;
		months: string[];
		today: string;
		onChoose: (query: Record<string, string>) => void;
	}

	const { range, months, today, onChoose }: Props = $props();

	interface Choice {
		value: string;
		label: string;
		icon: Component<{ class?: string }>;
	}

	const presetIcons: Record<EnergyPreset, Component<{ class?: string }>> = {
		today: CalendarCheckIcon,
		yesterday: CalendarMinusIcon,
		"last-3-days": CalendarClockIcon,
		"this-week": CalendarDaysIcon,
		"this-month": CalendarIcon,
		"last-month": CalendarFoldIcon,
		"last-3-months": CalendarRangeIcon,
		"this-year": Calendar1Icon,
		"year-to-date": CalendarArrowUpIcon,
		"all-time": InfinityIcon,
	};
	const seasons: {
		season: EnergySeason;
		label: string;
		icon: Choice["icon"];
	}[] = [
		{ season: "spring", label: "Spring", icon: Flower2Icon },
		{ season: "summer", label: "Summer", icon: SunIcon },
		{ season: "autumn", label: "Autumn", icon: LeafIcon },
		{ season: "winter", label: "Winter", icon: SnowflakeIcon },
	];
	const preset = (key: EnergyPreset): Choice => ({
		value: key,
		label: energyPresetLabels[key],
		icon: presetIcons[key],
	});
	const groups: { label: string; choices: Choice[] }[] = [
		{
			label: "Recent",
			choices: [
				preset("today"),
				preset("yesterday"),
				preset("last-3-days"),
				preset("this-week"),
			],
		},
		{
			label: "Months",
			choices: [
				preset("this-month"),
				preset("last-month"),
				preset("last-3-months"),
			],
		},
		{
			label: "Years",
			choices: [
				preset("this-year"),
				preset("year-to-date"),
				preset("all-time"),
			],
		},
		{
			label: "Seasons, the latest of each",
			choices: seasons.map(({ season, label, icon }) => ({
				value: `season:${season}`,
				label,
				icon,
			})),
		},
	];

	const desktop = new MediaQuery("(min-width: 768px)");
	let drawerOpen = $state(false);
	let choosing = $state(false);
	let from = $state("");
	let to = $state("");

	const onMonth = $derived(range.key.startsWith("month:"));
	const current = $derived(
		groups
			.flatMap((group) => group.choices)
			.find((choice) => choice.value === range.key)?.icon ??
			(onMonth ? CalendarSearchIcon : CalendarCogIcon),
	);

	function choose(value: string) {
		choosing = false;
		drawerOpen = false;
		onChoose({ range: value });
	}

	function startCustom() {
		choosing = !choosing;
		from = range.from;
		to = range.to;
	}
</script>

{#snippet customForm()}
	<form
		class="flex flex-col gap-3 sm:flex-row sm:items-end"
		onsubmit={(event) => {
			event.preventDefault();
			choosing = false;
			drawerOpen = false;
			onChoose({ from, to });
		}}
	>
		<Field.Field>
			<Field.Label for="energy-from">From</Field.Label>
			<Input
				id="energy-from"
				type="date"
				bind:value={from}
				max={today}
				required
				class="h-11"
			/>
		</Field.Field>
		<Field.Field>
			<Field.Label for="energy-to">To</Field.Label>
			<Input id="energy-to" type="date" bind:value={to} required class="h-11" />
		</Field.Field>
		<Button type="submit" class="h-11 rounded-xl px-5"><CheckIcon />Show</Button
		>
	</form>
{/snippet}

{#snippet row(choice: Choice)}
	{@const active = choice.value === range.key}
	<Button
		variant="ghost"
		class="h-12 w-full justify-start gap-3 rounded-xl px-3 text-base {active
			? 'bg-accent text-accent-foreground'
			: ''}"
		aria-current={active ? "true" : undefined}
		onclick={() => choose(choice.value)}
	>
		<choice.icon class="size-5" />
		<span class="min-w-0 flex-1 truncate text-left">{choice.label}</span>
		{#if active}<CheckIcon class="size-5" />{/if}
	</Button>
{/snippet}

{#if desktop.current}
	<div class="flex flex-col gap-3">
		<div
			class="flex flex-wrap items-center gap-2"
			role="group"
			aria-label="Period"
		>
			{#each groups as group, index (group.label)}
				{#if index > 0}
					<span class="bg-border mx-1 h-6 w-px" aria-hidden="true"></span>
				{/if}
				{#each group.choices as choice (choice.value)}
					{@const active = choice.value === range.key}
					<Button
						variant={active ? "default" : "secondary"}
						class="h-9 rounded-full px-3.5"
						aria-pressed={active}
						title={choice.value.startsWith("season:") && active
							? rangeLabel(range)
							: undefined}
						onclick={() => choose(choice.value)}
					>
						<choice.icon />{choice.label}
					</Button>
				{/each}
			{/each}
			<span class="bg-border mx-1 h-6 w-px" aria-hidden="true"></span>
			{#if months.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant={onMonth ? "default" : "secondary"}
								class="h-9 rounded-full px-3.5"
								><CalendarSearchIcon />{onMonth
									? rangeLabel(range)
									: "A month"}<ChevronDownIcon /></Button
							>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="max-h-80 min-w-52">
						{#each months as month (month)}
							<DropdownMenu.Item onSelect={() => choose(`month:${month}`)}>
								<CalendarIcon />
								<span class="flex-1">{monthName(month)}</span>
								{#if range.key === `month:${month}`}<CheckIcon />{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
			<Button
				variant={range.key === "custom" || choosing ? "default" : "secondary"}
				class="h-9 rounded-full px-3.5"
				aria-pressed={range.key === "custom"}
				aria-expanded={choosing}
				onclick={startCustom}
				><CalendarCogIcon />{range.key === "custom"
					? rangeLabel(range)
					: "Custom"}</Button
			>
		</div>
		{#if choosing}
			{@render customForm()}
		{/if}
	</div>
{:else}
	{@const Current = current}
	<Button
		variant="outline"
		class="h-11 w-full justify-between rounded-xl px-4"
		onclick={() => (drawerOpen = true)}
	>
		<span class="flex min-w-0 items-center gap-2">
			<Current class="text-muted-foreground size-5 shrink-0" />
			<span class="truncate">{rangeLabel(range)}</span>
		</span>
		<ChevronDownIcon class="text-muted-foreground size-5" />
	</Button>
	<Drawer.Root bind:open={drawerOpen}>
		<Drawer.Content>
			<Drawer.Header class="text-left">
				<Drawer.Title>Period</Drawer.Title>
			</Drawer.Header>
			<div class="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto px-3 pb-6">
				{#each groups as group (group.label)}
					<section class="flex flex-col gap-1">
						<h3 class="text-muted-foreground px-3 text-xs font-medium">
							{group.label}
						</h3>
						{#each group.choices as choice (choice.value)}
							{@render row(choice)}
						{/each}
					</section>
				{/each}
				{#if months.length > 0}
					<section class="flex flex-col gap-1">
						<h3 class="text-muted-foreground px-3 text-xs font-medium">
							Every month
						</h3>
						{#each months as month (month)}
							{@render row({
								value: `month:${month}`,
								label: monthName(month),
								icon: CalendarIcon,
							})}
						{/each}
					</section>
				{/if}
				<section class="flex flex-col gap-2">
					<Button
						variant="ghost"
						class="h-12 w-full justify-start gap-3 rounded-xl px-3 text-base {range.key ===
						'custom'
							? 'bg-accent text-accent-foreground'
							: ''}"
						aria-expanded={choosing}
						onclick={startCustom}
					>
						<CalendarCogIcon class="size-5" />
						<span class="flex-1 text-left">Custom range</span>
					</Button>
					{#if choosing}
						<div class="px-3">{@render customForm()}</div>
					{/if}
				</section>
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
