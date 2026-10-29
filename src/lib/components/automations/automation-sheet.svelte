<script lang="ts">
	import { enhance } from "$app/forms";
	import ArrowDownToLineIcon from "@lucide/svelte/icons/arrow-down-to-line";
	import ArrowUpToLineIcon from "@lucide/svelte/icons/arrow-up-to-line";
	import BlindsIcon from "@lucide/svelte/icons/blinds";
	import BotIcon from "@lucide/svelte/icons/bot";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import DropletIcon from "@lucide/svelte/icons/droplet";
	import FanIcon from "@lucide/svelte/icons/fan";
	import FlameIcon from "@lucide/svelte/icons/flame";
	import Flower2Icon from "@lucide/svelte/icons/flower-2";
	import HeaterIcon from "@lucide/svelte/icons/heater";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LeafIcon from "@lucide/svelte/icons/leaf";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PowerIcon from "@lucide/svelte/icons/power";
	import PowerOffIcon from "@lucide/svelte/icons/power-off";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";
	import SnowflakeIcon from "@lucide/svelte/icons/snowflake";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import SquareIcon from "@lucide/svelte/icons/square";
	import SunIcon from "@lucide/svelte/icons/sun";
	import SunriseIcon from "@lucide/svelte/icons/sunrise";
	import SunsetIcon from "@lucide/svelte/icons/sunset";
	import ThermometerIcon from "@lucide/svelte/icons/thermometer";
	import ThermometerSnowflakeIcon from "@lucide/svelte/icons/thermometer-snowflake";
	import TrendingDownIcon from "@lucide/svelte/icons/trending-down";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
	import XIcon from "@lucide/svelte/icons/x";
	import { type Component, untrack } from "svelte";

	import {
		type AutomationAction,
		type Period,
		type PresetKey,
		presetKeys,
		presets,
		type Season,
		seasons,
		type Trigger,
		weekdays,
	} from "#lib/automations.js";
	import IconButton from "#lib/components/icon-button.svelte";
	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import ToggleChoice from "#lib/components/toggle-choice.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import {
		climateModeLabels,
		climateModes,
		printerCommands,
		vacuumCommands,
	} from "#lib/devices.js";
	import type { AutomationDefinition } from "#lib/dto/automation.js";
	import { type HouseFloor, type HouseRoom, roomLabels } from "#lib/house.js";
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
		hasLocation: boolean;
	}

	let {
		open = $bindable(),
		editing,
		devices,
		rooms,
		floors,
		hasLocation,
	}: Props = $props();

	type TriggerChoice =
		"sunrise" | "sunset" | "time" | "temperature" | "contact";
	type PeriodChoice = Period["type"];

	let name = $state("");
	let triggerChoice = $state<TriggerChoice>("sunset");
	let offsetMinutes = $state(0);
	let time = $state("21:00");
	let days = $state<string[]>(["0", "1", "2", "3", "4", "5", "6"]);
	let direction = $state<"above" | "below">("above");
	let threshold = $state(28);
	let periodChoice = $state<PeriodChoice>("always");
	let chosenSeasons = $state<string[]>(["summer"]);
	let from = $state("2026-06-01");
	let to = $state("2026-08-31");
	let steps = $state<AutomationAction[]>([]);
	let startFrom = $state<string>("blank");
	let sensors = $state<string[]>([]);

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
		loadTrigger(existing?.trigger);
		loadPeriod(existing?.period);
		steps = existing ? structuredClone($state.snapshot(existing.actions)) : [];
	}

	function loadTrigger(trigger: Trigger | undefined) {
		triggerChoice =
			trigger?.type === "sun" ? trigger.event : (trigger?.type ?? "sunset");
		offsetMinutes = trigger?.type === "sun" ? trigger.offsetMinutes : 0;
		time = trigger?.type === "time" ? trigger.time : "21:00";
		days =
			trigger?.type === "time"
				? trigger.weekdays.map(String)
				: ["0", "1", "2", "3", "4", "5", "6"];
		direction = trigger?.type === "temperature" ? trigger.direction : "above";
		threshold = trigger?.type === "temperature" ? trigger.threshold : 28;
		sensors = trigger?.type === "contact" ? [...trigger.deviceIds] : [];
	}

	function loadPeriod(period: Period | undefined) {
		periodChoice = period?.type ?? "always";
		chosenSeasons = period?.type === "seasons" ? period.seasons : ["summer"];
		from = `2026-${period?.type === "dates" ? period.from : "06-01"}`;
		to = `2026-${period?.type === "dates" ? period.to : "08-31"}`;
	}

	const ofCards = (...cards: PluginCard[]) =>
		devices
			.filter((device) => cards.includes(device.card))
			.map((device) => ({ value: device.id, label: device.name }));
	const climateOptions = $derived(ofCards("climate"));
	const printerOptions = $derived(ofCards("printer"));
	const vacuumOptions = $derived(ofCards("vacuum"));
	const sensorOptions = $derived(ofCards("contact"));
	const valveOptions = $derived(ofCards("valve"));
	const heaterOptions = $derived(ofCards("climate", "valve"));
	const hasBlinds = $derived(devices.some((device) => device.card === "cover"));
	const roomOptions = $derived([
		{ value: "house", label: "Every blind in the house" },
		...[...roomLabels(rooms, floors)]
			.map(([value, label]) => ({ value, label }))
			.toSorted((first, second) => first.label.localeCompare(second.label)),
	]);

	const addable = $derived(
		[
			{
				label: "Move blinds",
				icon: BlindsIcon,
				available: hasBlinds,
				make: (): AutomationAction => ({
					type: "blinds",
					roomId: null,
					move: "close",
					position: null,
				}),
			},
			{
				label: "Set a heat pump",
				icon: ThermometerIcon,
				available: climateOptions.length > 0,
				make: (): AutomationAction => ({
					type: "climate",
					deviceId: climateOptions[0]?.value ?? "",
					power: true,
					mode: null,
					targetTemperature: 20,
				}),
			},
			{
				label: "Drive a printer",
				icon: PrinterIcon,
				available: printerOptions.length > 0,
				make: (): AutomationAction => ({
					type: "printer",
					deviceId: printerOptions[0]?.value ?? "",
					command: "pause",
				}),
			},
			{
				label: "Close radiator valves",
				icon: HeaterIcon,
				available: triggerChoice === "contact" && valveOptions.length > 0,
				make: (): AutomationAction => ({
					type: "valves",
					deviceIds: valveOptions.map((option) => option.value),
				}),
			},
			{
				label: "Turn the heating down",
				icon: ThermometerSnowflakeIcon,
				available: triggerChoice === "contact" && heaterOptions.length > 0,
				make: (): AutomationAction => ({
					type: "heating",
					deviceIds: heaterOptions.map((option) => option.value),
					degrees: 3,
				}),
			},
			{
				label: "Run a robot vacuum",
				icon: BotIcon,
				available: vacuumOptions.length > 0,
				make: (): AutomationAction => ({
					type: "vacuum",
					deviceId: vacuumOptions[0]?.value ?? "",
					command: "start",
				}),
			},
		].filter((entry) => entry.available),
	);

	const definition = $derived.by((): AutomationDefinition => {
		const trigger: Trigger =
			triggerChoice === "time"
				? {
						type: "time",
						time,
						weekdays: days
							.map(Number)
							.toSorted((first, second) => first - second),
					}
				: triggerChoice === "contact"
					? { type: "contact", deviceIds: sensors }
					: triggerChoice === "temperature"
						? { type: "temperature", direction, threshold: Number(threshold) }
						: {
								type: "sun",
								event: triggerChoice,
								offsetMinutes: Number(offsetMinutes) || 0,
							};
		const period: Period =
			periodChoice === "seasons"
				? { type: "seasons", seasons: chosenSeasons as Season[] }
				: periodChoice === "dates"
					? { type: "dates", from: from.slice(5), to: to.slice(5) }
					: { type: "always" };
		return { name, trigger, period, actions: steps };
	});

	const toggleItem =
		"bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 rounded-xl px-3";
	const optionIcons: Record<string, Component<{ class?: string }>> = {
		sunrise: SunriseIcon,
		sunset: SunsetIcon,
		time: ClockIcon,
		temperature: ThermometerIcon,
		contact: DoorOpenIcon,
		above: TrendingUpIcon,
		below: TrendingDownIcon,
		always: CalendarIcon,
		seasons: LeafIcon,
		dates: CalendarRangeIcon,
		open: ArrowUpToLineIcon,
		close: ArrowDownToLineIcon,
		position: SlidersHorizontalIcon,
		on: PowerIcon,
		off: PowerOffIcon,
		keep: RefreshCwIcon,
		heat: FlameIcon,
		dry: DropletIcon,
		cool: SnowflakeIcon,
		fan: FanIcon,
		auto: SparklesIcon,
		start: PlayIcon,
		resume: PlayIcon,
		pause: PauseIcon,
		stop: SquareIcon,
		dock: HouseIcon,
	};
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
	const commandLabels: Record<string, string> = {
		pause: "Pause",
		resume: "Resume",
		stop: "Stop",
		start: "Start",
		dock: "Dock",
	};
	const actionLabels: Record<AutomationAction["type"], string> = {
		blinds: "Move blinds",
		climate: "Set a heat pump",
		printer: "Drive a printer",
		vacuum: "Run a robot vacuum",
		valves: "Close radiator valves",
		heating: "Turn the heating down",
	};
	const actionIcons: Record<
		AutomationAction["type"],
		Component<{ class?: string }>
	> = {
		blinds: BlindsIcon,
		climate: ThermometerIcon,
		printer: PrinterIcon,
		vacuum: BotIcon,
		valves: HeaterIcon,
		heating: ThermometerSnowflakeIcon,
	};
</script>

{#snippet choices(
	label: string,
	options: {
		value: string;
		label: string;
		icon?: Component<{ class?: string }>;
	}[],
	value: string,
	onChange: (next: string) => void,
)}
	<ToggleGroup.Root
		type="single"
		{value}
		spacing={2}
		aria-label={label}
		class="w-full"
		onValueChange={(next) => next && onChange(next)}
	>
		{#each options as option (option.value)}
			<ToggleChoice
				value={option.value}
				label={option.label}
				icon={option.icon ?? optionIcons[option.value]}
				class={toggleItem}
			/>
		{/each}
	</ToggleGroup.Root>
{/snippet}

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
			success: `${name || "Routine"} saved.`,
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
			{@render choices(
				"Trigger",
				[
					{ value: "sunrise", label: "Sunrise" },
					{ value: "sunset", label: "Sunset" },
					{ value: "time", label: "A time" },
					{ value: "temperature", label: "Outside temperature" },
					...(sensorOptions.length > 0
						? [{ value: "contact", label: "A door or window opens" }]
						: []),
				],
				triggerChoice,
				(next) => (triggerChoice = next as TriggerChoice),
			)}
			{#if !hasLocation && triggerChoice !== "time" && triggerChoice !== "contact"}
				<Field.Description>
					Set the home's location in Admin, Homes first: sunrise, sunset and the
					temperature come from there.
				</Field.Description>
			{/if}
			{#if triggerChoice === "sunrise" || triggerChoice === "sunset"}
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
			{:else if triggerChoice === "time"}
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
							class={toggleItem}
							aria-label={day}>{day.slice(0, 2)}</ToggleGroup.Item
						>
					{/each}
				</ToggleGroup.Root>
			{:else if triggerChoice === "contact"}
				<Field.Field>
					<Field.Label for="automation-sensors"
						>Door and window sensors</Field.Label
					>
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
						>It runs when one of them opens; radiator valve steps hold until
						every one of them in that room is shut.</Field.Description
					>
				</Field.Field>
			{:else}
				{@render choices(
					"Direction",
					[
						{ value: "above", label: "Gets above" },
						{ value: "below", label: "Gets below" },
					],
					direction,
					(next) => (direction = next as "above" | "below"),
				)}
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
		</Field.Set>

		<Field.Set>
			<Field.Legend>During</Field.Legend>
			{@render choices(
				"Period",
				[
					{ value: "always", label: "All year" },
					{ value: "seasons", label: "Seasons" },
					{ value: "dates", label: "Dates" },
				],
				periodChoice,
				(next) => (periodChoice = next as PeriodChoice),
			)}
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
							class={toggleItem}
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
			<Field.Legend>Do</Field.Legend>
			<ul class="flex flex-col gap-3">
				{#each steps as step, index (index)}
					{@const Icon = actionIcons[step.type]}
					<li class="bg-secondary/50 flex flex-col gap-3 rounded-2xl p-3">
						<div class="flex items-center gap-2">
							<Icon class="text-muted-foreground size-5 shrink-0" />
							<span class="flex-1 font-medium">{actionLabels[step.type]}</span>
							<IconButton
								label="Remove this step"
								icon={XIcon}
								onclick={() => steps.splice(index, 1)}
							/>
						</div>
						{#if step.type === "blinds"}
							<Picker
								id="step-{index}-room"
								name=""
								label="Which blinds"
								options={roomOptions}
								value={step.roomId ?? "house"}
								onPick={(next) =>
									(step.roomId = next === "house" ? null : next)}
							/>
							{@render choices(
								"Move",
								[
									{ value: "open", label: "Open" },
									{ value: "close", label: "Close" },
									{ value: "position", label: "To a position" },
								],
								step.move,
								(next) => {
									step.move = next as typeof step.move;
									step.position =
										next === "position" ? (step.position ?? 50) : null;
								},
							)}
							{#if step.move === "position"}
								<Field.Field>
									<Field.Label for="step-{index}-position">Open (%)</Field.Label
									>
									<Input
										id="step-{index}-position"
										type="number"
										inputmode="numeric"
										min={0}
										max={100}
										bind:value={step.position}
										class="h-11"
									/>
								</Field.Field>
							{/if}
						{:else if step.type === "valves"}
							<Picker
								id="step-{index}-valves"
								name=""
								label="Radiator valves"
								options={valveOptions}
								multiple
								bind:values={step.deviceIds}
								placeholder="Pick the valves it closes"
							/>
							<p class="text-muted-foreground text-sm">
								Only the ones in the room of the sensor that opened close.
							</p>
						{:else if step.type === "heating"}
							<Picker
								id="step-{index}-heaters"
								name=""
								label="Heat pumps and radiator valves"
								options={heaterOptions}
								multiple
								bind:values={step.deviceIds}
								placeholder="Pick what it turns down"
							/>
							<Field.Field>
								<Field.Label for="step-{index}-degrees"
									>Down by (°C)</Field.Label
								>
								<Input
									id="step-{index}-degrees"
									type="number"
									inputmode="decimal"
									step="0.5"
									min={0.5}
									max={10}
									bind:value={step.degrees}
									class="h-11"
								/>
								<Field.Description
									>Only the ones in the room of the sensor that opened, or all
									of them for a door in the whole house; they go back once it
									shuts.</Field.Description
								>
							</Field.Field>
						{:else if step.type === "climate"}
							<Picker
								id="step-{index}-device"
								name=""
								label="Heat pump"
								options={climateOptions}
								value={step.deviceId}
								onPick={(next) => (step.deviceId = next)}
							/>
							{@render choices(
								"Power",
								[
									{ value: "on", label: "On" },
									{ value: "off", label: "Off" },
								],
								step.power ? "on" : "off",
								(next) => (step.power = next === "on"),
							)}
							{#if step.power}
								{@render choices(
									"Mode",
									[
										{ value: "keep", label: "Keep mode" },
										...climateModes.map((mode) => ({
											value: mode,
											label: climateModeLabels[mode],
										})),
									],
									step.mode ?? "keep",
									(next) =>
										(step.mode =
											next === "keep" ? null : (next as typeof step.mode)),
								)}
								<Field.Field>
									<Field.Label for="step-{index}-temperature"
										>Temperature (°C)</Field.Label
									>
									<Input
										id="step-{index}-temperature"
										type="number"
										inputmode="decimal"
										step="0.5"
										min={5}
										max={35}
										bind:value={step.targetTemperature}
										class="h-11"
									/>
								</Field.Field>
							{/if}
						{:else}
							<Picker
								id="step-{index}-device"
								name=""
								label={step.type === "printer" ? "Printer" : "Robot vacuum"}
								options={step.type === "printer"
									? printerOptions
									: vacuumOptions}
								value={step.deviceId}
								onPick={(next) => (step.deviceId = next)}
							/>
							{@render choices(
								"Command",
								(step.type === "printer"
									? printerCommands
									: vacuumCommands
								).map((command) => ({
									value: command,
									label: commandLabels[command] ?? command,
								})),
								step.command,
								(next) => (step.command = next as never),
							)}
						{/if}
					</li>
				{/each}
			</ul>
			{#if addable.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								class="h-11 self-start rounded-xl px-5"
								><PlusIcon />Add a step</Button
							>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="w-56">
						{#each addable as entry (entry.label)}
							<DropdownMenu.Item onSelect={() => steps.push(entry.make())}>
								<entry.icon />{entry.label}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<Field.Description
					>Add blinds, a heat pump, a printer or a robot vacuum first.</Field.Description
				>
			{/if}
		</Field.Set>

		<Button type="submit" class="h-11 rounded-xl px-5"><CheckIcon />Save</Button
		>
	</form>
</ResponsiveSheet>
