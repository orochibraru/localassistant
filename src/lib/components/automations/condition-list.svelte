<script lang="ts">
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SunIcon from "@lucide/svelte/icons/sun";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Component } from "svelte";

	import { checksFor, type Condition, weekdays } from "#lib/automations.js";
	import ChoiceRow from "#lib/components/automations/choice-row.svelte";
	import StateTestEditor from "#lib/components/automations/state-test-editor.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import type { PluginCard } from "#lib/plugins.js";

	interface Props {
		conditions: Condition[];
		devices: { id: string; card: PluginCard; name: string }[];
		hasLocation: boolean;
	}

	let { conditions = $bindable(), devices, hasLocation }: Props = $props();

	const firstWatchable = $derived(
		devices.find((device) => checksFor(device.card).length > 0),
	);

	const labels: Record<Condition["type"], string> = {
		device: "A device is…",
		time: "Between two times",
		weekdays: "On some days",
		sun: "Day or night",
	};
	const icons: Record<Condition["type"], Component<{ class?: string }>> = {
		device: PlugIcon,
		time: ClockIcon,
		weekdays: CalendarDaysIcon,
		sun: SunIcon,
	};

	const addable = $derived(
		[
			{
				type: "device" as const,
				available: firstWatchable !== undefined,
				make: (): Condition => ({
					type: "device",
					test: {
						deviceId: firstWatchable?.id ?? "",
						check: firstWatchable
							? (checksFor(firstWatchable.card).find(
									(check) => check !== "pressed",
								) ?? "on")
							: "on",
						value: null,
					},
				}),
			},
			{
				type: "time" as const,
				available: true,
				make: (): Condition => ({ type: "time", from: "22:00", to: "07:00" }),
			},
			{
				type: "weekdays" as const,
				available: true,
				make: (): Condition => ({
					type: "weekdays",
					weekdays: [0, 1, 2, 3, 4],
				}),
			},
			{
				type: "sun" as const,
				available: true,
				make: (): Condition => ({ type: "sun", when: "night" }),
			},
		].filter((entry) => entry.available),
	);
</script>

<ul class="flex flex-col gap-3">
	{#each conditions as condition, index (index)}
		{@const Icon = icons[condition.type]}
		<li class="bg-secondary/50 flex flex-col gap-3 rounded-2xl p-3">
			<div class="flex items-center gap-2">
				<Icon class="text-muted-foreground size-5 shrink-0" />
				<span class="flex-1 font-medium">{labels[condition.type]}</span>
				<IconButton
					label="Remove this condition"
					icon={XIcon}
					onclick={() => conditions.splice(index, 1)}
				/>
			</div>
			{#if condition.type === "device"}
				<StateTestEditor
					id="condition-{index}"
					bind:test={condition.test}
					{devices}
					holds
				/>
			{:else if condition.type === "time"}
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label for="condition-{index}-from">From</Field.Label>
						<Input
							id="condition-{index}-from"
							type="time"
							bind:value={condition.from}
							required
							class="h-11"
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label for="condition-{index}-to">To</Field.Label>
						<Input
							id="condition-{index}-to"
							type="time"
							bind:value={condition.to}
							required
							class="h-11"
						/>
					</Field.Field>
				</div>
			{:else if condition.type === "weekdays"}
				<ToggleGroup.Root
					type="multiple"
					value={condition.weekdays.map(String)}
					onValueChange={(next) =>
						(condition.weekdays = next
							.map(Number)
							.toSorted((first, second) => first - second))}
					spacing={2}
					aria-label="Days"
					class="grid w-full grid-cols-7"
				>
					{#each weekdays as day, dayIndex (day)}
						<ToggleGroup.Item
							value={String(dayIndex)}
							class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 rounded-xl"
							aria-label={day}>{day.slice(0, 2)}</ToggleGroup.Item
						>
					{/each}
				</ToggleGroup.Root>
			{:else}
				<ChoiceRow
					label="When"
					options={[
						{ value: "day", label: "During the day", icon: SunIcon },
						{ value: "night", label: "At night", icon: MoonIcon },
					]}
					value={condition.when}
					onChange={(next) =>
						(condition.when = next === "day" ? "day" : "night")}
				/>
				{#if !hasLocation}
					<p class="text-muted-foreground text-sm">
						Set the home's location in Admin, Homes first: sunrise and sunset
						come from there.
					</p>
				{/if}
			{/if}
		</li>
	{/each}
</ul>
<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="h-11 self-start rounded-xl px-5"
				><PlusIcon />Add a condition</Button
			>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-56">
		{#each addable as entry (entry.type)}
			{@const Icon = icons[entry.type]}
			<DropdownMenu.Item onSelect={() => conditions.push(entry.make())}>
				<Icon />{labels[entry.type]}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
