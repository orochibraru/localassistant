<script lang="ts">
	import ArrowDownToLineIcon from "@lucide/svelte/icons/arrow-down-to-line";
	import ArrowUpToLineIcon from "@lucide/svelte/icons/arrow-up-to-line";
	import BellIcon from "@lucide/svelte/icons/bell";
	import BlindsIcon from "@lucide/svelte/icons/blinds";
	import HeaterIcon from "@lucide/svelte/icons/heater";
	import HourglassIcon from "@lucide/svelte/icons/hourglass";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import ThermometerSnowflakeIcon from "@lucide/svelte/icons/thermometer-snowflake";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Component } from "svelte";

	import type { AutomationAction } from "#lib/automations.js";
	import ChoiceRow from "#lib/components/automations/choice-row.svelte";
	import CommandEditor from "#lib/components/automations/command-editor.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import Picker from "#lib/components/picker.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { type HouseFloor, type HouseRoom, roomLabels } from "#lib/house.js";
	import type { PluginCard } from "#lib/plugins.js";
	import { startingCommand } from "#lib/scenes.js";

	interface Props {
		steps: AutomationAction[];
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
		followsContact: boolean;
	}

	let {
		steps = $bindable(),
		devices,
		rooms,
		floors,
		scenes,
		people,
		followsContact,
	}: Props = $props();

	const whoOptions = $derived([
		{ value: "everyone", label: "Everyone" },
		{ value: "admins", label: "The admins" },
		...people.map((person) => ({ value: person.id, label: person.name })),
	]);

	const ofCards = (...cards: PluginCard[]) =>
		devices
			.filter((device) => cards.includes(device.card))
			.map((device) => ({ value: device.id, label: device.name }));
	const drivable = $derived(
		devices.filter((device) => startingCommand(device.card) !== null),
	);
	const valveOptions = $derived(ofCards("valve"));
	const heaterOptions = $derived(ofCards("climate", "valve"));
	const hasBlinds = $derived(devices.some((device) => device.card === "cover"));
	const roomOptions = $derived([
		{ value: "house", label: "Every blind in the house" },
		...[...roomLabels(rooms, floors)]
			.map(([value, label]) => ({ value, label }))
			.toSorted((first, second) => first.label.localeCompare(second.label)),
	]);

	const labels: Record<AutomationAction["type"], string> = {
		device: "Drive a device",
		scene: "Set a scene",
		delay: "Wait",
		notify: "Send a notification",
		blinds: "Move blinds",
		valves: "Close radiator valves",
		heating: "Turn the heating down",
	};
	const icons: Record<
		AutomationAction["type"],
		Component<{ class?: string }>
	> = {
		device: PlugIcon,
		scene: SparklesIcon,
		delay: HourglassIcon,
		notify: BellIcon,
		blinds: BlindsIcon,
		valves: HeaterIcon,
		heating: ThermometerSnowflakeIcon,
	};

	const addable = $derived(
		[
			{
				type: "device" as const,
				available: drivable.length > 0,
				make: (): AutomationAction | null => {
					const first = drivable[0];
					const command = first ? startingCommand(first.card) : null;
					return first && command
						? { type: "device", deviceId: first.id, command }
						: null;
				},
			},
			{
				type: "scene" as const,
				available: scenes.length > 0,
				make: (): AutomationAction => ({
					type: "scene",
					sceneId: scenes[0]?.id ?? "",
				}),
			},
			{
				type: "blinds" as const,
				available: hasBlinds,
				make: (): AutomationAction => ({
					type: "blinds",
					roomId: null,
					move: "close",
					position: null,
				}),
			},
			{
				type: "notify" as const,
				available: true,
				make: (): AutomationAction => ({
					type: "notify",
					who: "everyone",
					title: "",
					body: "",
					sceneIds: [],
				}),
			},
			{
				type: "delay" as const,
				available: true,
				make: (): AutomationAction => ({ type: "delay", minutes: 5 }),
			},
			{
				type: "valves" as const,
				available: followsContact && valveOptions.length > 0,
				make: (): AutomationAction => ({
					type: "valves",
					deviceIds: valveOptions.map((option) => option.value),
				}),
			},
			{
				type: "heating" as const,
				available: followsContact && heaterOptions.length > 0,
				make: (): AutomationAction => ({
					type: "heating",
					deviceIds: heaterOptions.map((option) => option.value),
					degrees: 3,
				}),
			},
		].filter((entry) => entry.available),
	);

	function pickDevice(index: number, deviceId: string) {
		const device = drivable.find((entry) => entry.id === deviceId);
		const step = steps[index];
		const command = device ? startingCommand(device.card) : null;
		if (step?.type !== "device" || !command) {
			return;
		}
		steps[index] = {
			type: "device",
			deviceId,
			command: command.type === step.command.type ? step.command : command,
		};
	}
</script>

<ul class="flex flex-col gap-3">
	{#each steps as step, index (index)}
		{@const Icon = icons[step.type]}
		<li class="bg-secondary/50 flex flex-col gap-3 rounded-2xl p-3">
			<div class="flex items-center gap-2">
				<Icon class="text-muted-foreground size-5 shrink-0" />
				<span class="flex-1 font-medium">{labels[step.type]}</span>
				<IconButton
					label="Remove this step"
					icon={XIcon}
					onclick={() => steps.splice(index, 1)}
				/>
			</div>
			{#if step.type === "device"}
				<Picker
					id="step-{index}-device"
					name=""
					label="Device"
					options={drivable.map((device) => ({
						value: device.id,
						label: device.name,
					}))}
					value={step.deviceId}
					onPick={(next) => pickDevice(index, next)}
					search={{
						placeholder: "Search devices",
						empty: "No device matches.",
					}}
				/>
				<CommandEditor id="step-{index}" bind:command={step.command} />
			{:else if step.type === "scene"}
				<Picker
					id="step-{index}-scene"
					name=""
					label="Scene"
					options={scenes.map((scene) => ({
						value: scene.id,
						label: scene.name,
					}))}
					value={step.sceneId}
					onPick={(next) => (step.sceneId = next)}
				/>
			{:else if step.type === "notify"}
				<Picker
					id="step-{index}-who"
					name=""
					label="Tell"
					options={whoOptions}
					value={step.who}
					onPick={(next) => (step.who = next)}
				/>
				<Field.Field>
					<Field.Label for="step-{index}-title">Title</Field.Label>
					<Input
						id="step-{index}-title"
						bind:value={step.title}
						placeholder="The front door is open"
						maxlength={80}
						required
						class="h-11"
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label for="step-{index}-body">Message</Field.Label>
					<Input
						id="step-{index}-body"
						bind:value={step.body}
						placeholder="Optional"
						maxlength={200}
						class="h-11"
					/>
				</Field.Field>
				{#if scenes.length > 0}
					<Field.Field>
						<Field.Label for="step-{index}-buttons">Buttons</Field.Label>
						<Picker
							id="step-{index}-buttons"
							name=""
							label="Buttons"
							options={scenes.map((scene) => ({
								value: scene.id,
								label: scene.name,
							}))}
							multiple
							bind:values={step.sceneIds}
							placeholder="None"
						/>
						<Field.Description
							>Up to two scenes it offers to set, from the notification itself
							(Android and desktop browsers; iPhones show the message only).</Field.Description
						>
					</Field.Field>
				{/if}
			{:else if step.type === "delay"}
				<Field.Field>
					<Field.Label for="step-{index}-minutes">Minutes</Field.Label>
					<Input
						id="step-{index}-minutes"
						type="number"
						inputmode="numeric"
						min={1}
						max={1440}
						bind:value={step.minutes}
						class="h-11"
					/>
					<Field.Description
						>The next steps run after it; changing or turning off the routine
						cancels them.</Field.Description
					>
				</Field.Field>
			{:else if step.type === "blinds"}
				<Picker
					id="step-{index}-room"
					name=""
					label="Which blinds"
					options={roomOptions}
					value={step.roomId ?? "house"}
					onPick={(next) => (step.roomId = next === "house" ? null : next)}
				/>
				<ChoiceRow
					label="Move"
					options={[
						{ value: "open", label: "Open", icon: ArrowUpToLineIcon },
						{ value: "close", label: "Close", icon: ArrowDownToLineIcon },
						{
							value: "position",
							label: "To a position",
							icon: SlidersHorizontalIcon,
						},
					]}
					value={step.move}
					onChange={(next) => {
						step.move =
							next === "open"
								? "open"
								: next === "close"
									? "close"
									: "position";
						step.position = next === "position" ? (step.position ?? 50) : null;
					}}
				/>
				{#if step.move === "position"}
					<Field.Field>
						<Field.Label for="step-{index}-position">Open (%)</Field.Label>
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
					<Field.Label for="step-{index}-degrees">Down by (°C)</Field.Label>
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
						>Only the ones in the room of the sensor that opened, or all of them
						for a door in the whole house; they go back once it shuts.</Field.Description
					>
				</Field.Field>
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
				class="h-11 self-start rounded-xl px-5"><PlusIcon />Add a step</Button
			>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-56">
		{#each addable as entry (entry.type)}
			{@const Icon = icons[entry.type]}
			<DropdownMenu.Item
				onSelect={() => {
					const step = entry.make();
					if (step) {
						steps.push(step);
					}
				}}
			>
				<Icon />{labels[entry.type]}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
