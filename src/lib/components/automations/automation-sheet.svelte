<script lang="ts">
	import { enhance } from "$app/forms";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";
	import CheckIcon from "@lucide/svelte/icons/check";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import Flower2Icon from "@lucide/svelte/icons/flower-2";
	import HeaterIcon from "@lucide/svelte/icons/heater";
	import LeafIcon from "@lucide/svelte/icons/leaf";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SnowflakeIcon from "@lucide/svelte/icons/snowflake";
	import SunIcon from "@lucide/svelte/icons/sun";
	import SunriseIcon from "@lucide/svelte/icons/sunrise";
	import SunsetIcon from "@lucide/svelte/icons/sunset";
	import { type Component, untrack } from "svelte";

	import {
		type AutomationAction,
		type Condition,
		type Period,
		type PresetKey,
		presetKeys,
		presets,
		type Season,
		seasons,
		type Trigger,
	} from "#lib/automations.js";
	import ChoiceRow from "#lib/components/automations/choice-row.svelte";
	import ConditionList from "#lib/components/automations/condition-list.svelte";
	import StepList from "#lib/components/automations/step-list.svelte";
	import TriggerEditor from "#lib/components/automations/trigger-editor.svelte";
	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import ToggleChoice from "#lib/components/toggle-choice.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import type { AutomationDefinition } from "#lib/dto/automation.js";
	import type { HouseFloor, HouseRoom } from "#lib/house.js";
	import type { PluginCard } from "#lib/plugins.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Props {
		open: boolean;
		editing: (AutomationDefinition & { id: string }) | null;
		devices: {
			id: string;
			card: PluginCard;
			name: string;
			roomId: string | null;
		}[];
		rooms: HouseRoom[];
		floors: HouseFloor[];
		scenes: { id: string; name: string }[];
		people: { id: string; name: string }[];
		hasLocation: boolean;
	}

	let {
		open = $bindable(),
		editing,
		devices,
		rooms,
		floors,
		scenes,
		people,
		hasLocation,
	}: Props = $props();

	type PeriodChoice = Period["type"];

	let name = $state("");
	let trigger = $state<Trigger>({
		type: "sun",
		event: "sunset",
		offsetMinutes: 0,
	});
	let loaded = $state(0);
	let periodChoice = $state<PeriodChoice>("always");
	let chosenSeasons = $state<string[]>(["summer"]);
	let from = $state("2026-06-01");
	let to = $state("2026-08-31");
	let conditions = $state<Condition[]>([]);
	let steps = $state<AutomationAction[]>([]);
	let startFrom = $state<string>("blank");

	const presetIcons: Record<PresetKey, Component<{ class?: string }>> = {
		"blinds-sunset": SunsetIcon,
		"blinds-sunrise": SunriseIcon,
		"blinds-heat": SunIcon,
		"window-valves": HeaterIcon,
		"door-heating": DoorOpenIcon,
	};
	const startOptions = [
		{ value: "blank", label: "A blank routine", icon: PlusIcon },
		...presetKeys.map((key) => ({
			value: key,
			label: presets[key].title,
			icon: presetIcons[key],
		})),
	];

	$effect(() => {
		const current = editing;
		if (open) {
			untrack(() => {
				startFrom = "blank";
				load(current);
			});
		}
	});

	function pickStart(next: string) {
		startFrom = next;
		const key = presetKeys.find((entry) => entry === next);
		load(key ? { ...presets[key].build(devices), id: "" } : null);
	}

	function load(existing: Props["editing"]) {
		name = existing?.name ?? "";
		trigger = existing
			? structuredClone($state.snapshot(existing.trigger))
			: { type: "sun", event: "sunset", offsetMinutes: 0 };
		loaded += 1;
		const period = existing?.period;
		periodChoice = period?.type ?? "always";
		chosenSeasons = period?.type === "seasons" ? period.seasons : ["summer"];
		from = `2026-${period?.type === "dates" ? period.from : "06-01"}`;
		to = `2026-${period?.type === "dates" ? period.to : "08-31"}`;
		conditions = existing
			? structuredClone($state.snapshot(existing.conditions))
			: [];
		steps = existing ? structuredClone($state.snapshot(existing.actions)) : [];
	}

	const definition = $derived.by((): AutomationDefinition => {
		const period: Period =
			periodChoice === "seasons"
				? { type: "seasons", seasons: chosenSeasons as Season[] }
				: periodChoice === "dates"
					? { type: "dates", from: from.slice(5), to: to.slice(5) }
					: { type: "always" };
		return { name, trigger, period, conditions, actions: steps };
	});

	const seasonLabels: Record<Season, string> = {
		spring: "Spring",
		summer: "Summer",
		autumn: "Autumn",
		winter: "Winter",
	};
	const seasonIcons: Record<Season, Component<{ class?: string }>> = {
		spring: Flower2Icon,
		summer: SunIcon,
		autumn: LeafIcon,
		winter: SnowflakeIcon,
	};
</script>

<ResponsiveSheet
	bind:open
	wide
	title={editing ? `Edit ${editing.name}` : "New routine"}
	description="Run by the server, whether or not anyone has the app open."
>
	{#if !editing}
		<Field.Field>
			<Field.Label for="automation-start">Start from</Field.Label>
			<Picker
				id="automation-start"
				name=""
				label="Start from"
				options={startOptions}
				value={startFrom}
				onPick={pickStart}
				search={{ placeholder: "Search presets", empty: "No preset matches." }}
			/>
		</Field.Field>
	{/if}
	<form
		method="POST"
		action="?/save"
		class="flex flex-col gap-6 pb-6"
		use:enhance={enhanceToast({
			loading: "Saving",
			success: () => `${name || "Routine"} saved.`,
			onSuccess: () => {
				open = false;
			},
		})}
	>
		<input type="hidden" name="id" value={editing?.id ?? ""} />
		<input type="hidden" name="definition" value={JSON.stringify(definition)} />
		<Field.Field>
			<Field.Label for="automation-name">Name</Field.Label>
			<Input
				id="automation-name"
				bind:value={name}
				placeholder="Close the blinds at sunset"
				required
				class="h-11"
			/>
		</Field.Field>

		<Field.Set>
			<Field.Legend>When</Field.Legend>
			{#key loaded}
				<TriggerEditor bind:trigger {devices} {people} {hasLocation} />
			{/key}
		</Field.Set>

		<Field.Set>
			<Field.Legend>During</Field.Legend>
			<ChoiceRow
				label="Period"
				options={[
					{ value: "always", label: "All year", icon: CalendarIcon },
					{ value: "seasons", label: "Seasons", icon: LeafIcon },
					{ value: "dates", label: "Dates", icon: CalendarRangeIcon },
				]}
				value={periodChoice}
				onChange={(next) => (periodChoice = next as PeriodChoice)}
			/>
			{#if periodChoice === "seasons"}
				<ToggleGroup.Root
					type="multiple"
					bind:value={chosenSeasons}
					spacing={2}
					aria-label="Seasons"
					class="grid w-full grid-cols-2 sm:grid-cols-4"
				>
					{#each seasons as season (season)}
						<ToggleChoice
							value={season}
							label={seasonLabels[season]}
							icon={seasonIcons[season]}
							class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 rounded-xl px-3"
						/>
					{/each}
				</ToggleGroup.Root>
				<Field.Description
					>Winter is December to February, summer June to August.</Field.Description
				>
			{:else if periodChoice === "dates"}
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label for="automation-from">From</Field.Label>
						<Input
							id="automation-from"
							type="date"
							bind:value={from}
							required
							class="h-11"
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label for="automation-to">To</Field.Label>
						<Input
							id="automation-to"
							type="date"
							bind:value={to}
							required
							class="h-11"
						/>
					</Field.Field>
				</div>
				<Field.Description
					>The year doesn't matter: it repeats every year.</Field.Description
				>
			{/if}
		</Field.Set>

		<Field.Set>
			<Field.Legend>Only if</Field.Legend>
			<Field.Description
				>Every condition has to hold when it's set off, or it skips this time.
				Run now ignores them.</Field.Description
			>
			<ConditionList bind:conditions {devices} {people} {hasLocation} />
		</Field.Set>

		<Field.Set>
			<Field.Legend>Do</Field.Legend>
			<StepList
				bind:steps
				{devices}
				{rooms}
				{floors}
				{scenes}
				{people}
				followsContact={trigger.type === "contact"}
			/>
		</Field.Set>

		<Button type="submit" class="h-11 rounded-xl px-5"><CheckIcon />Save</Button
		>
	</form>
</ResponsiveSheet>
