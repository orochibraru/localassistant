<script lang="ts">
	import ClockIcon from "@lucide/svelte/icons/clock";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import SunriseIcon from "@lucide/svelte/icons/sunrise";
	import SunsetIcon from "@lucide/svelte/icons/sunset";
	import ThermometerIcon from "@lucide/svelte/icons/thermometer";
	import TrendingDownIcon from "@lucide/svelte/icons/trending-down";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
	import { untrack } from "svelte";

	import {
		checksFor,
		type StateTest,
		type Trigger,
		weekdays,
	} from "#lib/automations.js";
	import ChoiceRow from "#lib/components/automations/choice-row.svelte";
	import StateTestEditor from "#lib/components/automations/state-test-editor.svelte";
	import Picker from "#lib/components/picker.svelte";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import type { PluginCard } from "#lib/plugins.js";

	interface Props {
		trigger: Trigger;
		devices: { id: string; card: PluginCard; name: string }[];
		hasLocation: boolean;
	}

	let { trigger = $bindable(), devices, hasLocation }: Props = $props();

	type Choice =
		"sunrise" | "sunset" | "time" | "temperature" | "contact" | "device";

	const initial = untrack(() => trigger);
	const firstWatchable = untrack(() =>
		devices.find((device) => checksFor(device.card).length > 0),
	);
	let choice = $state<Choice>(
		initial.type === "sun" ? initial.event : initial.type,
	);
	let offsetMinutes = $state(
		initial.type === "sun" ? initial.offsetMinutes : 0,
	);
	let time = $state(initial.type === "time" ? initial.time : "21:00");
	let days = $state<string[]>(
		initial.type === "time"
			? initial.weekdays.map(String)
			: ["0", "1", "2", "3", "4", "5", "6"],
	);
	let direction = $state<"above" | "below">(
		initial.type === "temperature" ? initial.direction : "above",
	);
	let threshold = $state(
		initial.type === "temperature" ? initial.threshold : 28,
	);
	let sensors = $state<string[]>(
		initial.type === "contact" ? [...initial.deviceIds] : [],
	);
	let test = $state<StateTest>(
		initial.type === "device"
			? { ...initial.test }
			: {
					deviceId: firstWatchable?.id ?? "",
					check: firstWatchable
						? (checksFor(firstWatchable.card)[0] ?? "on")
						: "on",
					value: null,
				},
	);

	const sensorOptions = $derived(
		devices
			.filter((device) => device.card === "contact")
			.map((device) => ({ value: device.id, label: device.name })),
	);

	$effect(() => {
		trigger =
			choice === "time"
				? {
						type: "time",
						time,
						weekdays: days
							.map(Number)
							.toSorted((first, second) => first - second),
					}
				: choice === "contact"
					? { type: "contact", deviceIds: [...sensors] }
					: choice === "device"
						? { type: "device", test: { ...test } }
						: choice === "temperature"
							? { type: "temperature", direction, threshold: Number(threshold) }
							: {
									type: "sun",
									event: choice,
									offsetMinutes: Number(offsetMinutes) || 0,
								};
	});
</script>

<ChoiceRow
	label="Trigger"
	options={[
		{ value: "sunrise", label: "Sunrise", icon: SunriseIcon },
		{ value: "sunset", label: "Sunset", icon: SunsetIcon },
		{ value: "time", label: "A time", icon: ClockIcon },
		{
			value: "temperature",
			label: "Outside temperature",
			icon: ThermometerIcon,
		},
		...(sensorOptions.length > 0
			? [
					{
						value: "contact",
						label: "A door or window opens",
						icon: DoorOpenIcon,
					},
				]
			: []),
		...(firstWatchable
			? [{ value: "device", label: "A device changes", icon: PlugIcon }]
			: []),
	]}
	value={choice}
	onChange={(next) => (choice = next as Choice)}
/>
{#if !hasLocation && (choice === "sunrise" || choice === "sunset" || choice === "temperature")}
	<Field.Description>
		Set the home's location in Admin, Homes first: sunrise, sunset and the
		temperature come from there.
	</Field.Description>
{/if}
{#if choice === "sunrise" || choice === "sunset"}
	<Field.Field>
		<Field.Label for="automation-offset"
			>Minutes after (negative for before)</Field.Label
		>
		<Input
			id="automation-offset"
			type="number"
			inputmode="numeric"
			min={-240}
			max={240}
			bind:value={offsetMinutes}
			class="h-11"
		/>
	</Field.Field>
{:else if choice === "time"}
	<Field.Field>
		<Field.Label for="automation-time">Time</Field.Label>
		<Input
			id="automation-time"
			type="time"
			bind:value={time}
			required
			class="h-11"
		/>
	</Field.Field>
	<ToggleGroup.Root
		type="multiple"
		bind:value={days}
		spacing={2}
		aria-label="Days"
		class="grid w-full grid-cols-7"
	>
		{#each weekdays as day, index (day)}
			<ToggleGroup.Item
				value={String(index)}
				class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 rounded-xl"
				aria-label={day}>{day.slice(0, 2)}</ToggleGroup.Item
			>
		{/each}
	</ToggleGroup.Root>
{:else if choice === "contact"}
	<Field.Field>
		<Field.Label for="automation-sensors">Door and window sensors</Field.Label>
		<Picker
			id="automation-sensors"
			name=""
			label="Door and window sensors"
			options={sensorOptions}
			multiple
			bind:values={sensors}
			placeholder="Pick the sensors that trigger it"
		/>
		<Field.Description
			>It runs when one of them opens; radiator valve steps hold until every one
			of them in that room is shut.</Field.Description
		>
	</Field.Field>
{:else if choice === "device"}
	<StateTestEditor id="trigger" bind:test {devices} />
{:else}
	<ChoiceRow
		label="Direction"
		options={[
			{ value: "above", label: "Gets above", icon: TrendingUpIcon },
			{ value: "below", label: "Gets below", icon: TrendingDownIcon },
		]}
		value={direction}
		onChange={(next) => (direction = next === "below" ? "below" : "above")}
	/>
	<Field.Field>
		<Field.Label for="automation-threshold">Temperature (°C)</Field.Label>
		<Input
			id="automation-threshold"
			type="number"
			inputmode="decimal"
			step="0.5"
			bind:value={threshold}
			class="h-11"
		/>
	</Field.Field>
{/if}
