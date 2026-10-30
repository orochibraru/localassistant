<script lang="ts">
	import ArrowDownToLineIcon from "@lucide/svelte/icons/arrow-down-to-line";
	import ArrowUpToLineIcon from "@lucide/svelte/icons/arrow-up-to-line";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LockIcon from "@lucide/svelte/icons/lock";
	import LockOpenIcon from "@lucide/svelte/icons/lock-open";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PowerIcon from "@lucide/svelte/icons/power";
	import PowerOffIcon from "@lucide/svelte/icons/power-off";
	import SkipForwardIcon from "@lucide/svelte/icons/skip-forward";
	import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";
	import SquareIcon from "@lucide/svelte/icons/square";

	import ChoiceRow from "#lib/components/automations/choice-row.svelte";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import {
		climateModeLabels,
		climateModes,
		type MediaAction,
		printerCommands,
		vacuumCommands,
	} from "#lib/devices.js";
	import type { DeviceCommand } from "#lib/plugin-sdk.js";

	interface Props {
		id: string;
		command: DeviceCommand;
	}

	let { id, command = $bindable() }: Props = $props();

	const powerOptions = [
		{ value: "on", label: "On", icon: PowerIcon },
		{ value: "off", label: "Off", icon: PowerOffIcon },
	];
	const commandLabels: Record<string, string> = {
		pause: "Pause",
		resume: "Resume",
		stop: "Stop",
		start: "Start",
		dock: "Dock",
	};
	const commandIcons = {
		pause: PauseIcon,
		resume: PlayIcon,
		start: PlayIcon,
		stop: SquareIcon,
		dock: HouseIcon,
	};

	function optional(text: string): number | undefined {
		const value = Number.parseFloat(text);
		return Number.isFinite(value) ? value : undefined;
	}
</script>

{#snippet numberField(
	key: string,
	label: string,
	value: number | undefined,
	limits: { min: number; max: number; step?: number },
	onChange: (next: number | undefined) => void,
	description?: string,
)}
	<Field.Field>
		<Field.Label for="{id}-{key}">{label}</Field.Label>
		<Input
			id="{id}-{key}"
			type="number"
			inputmode="decimal"
			min={limits.min}
			max={limits.max}
			step={limits.step ?? 1}
			value={value ?? ""}
			placeholder="Leave as it is"
			oninput={(event) => onChange(optional(event.currentTarget.value))}
			class="h-11"
		/>
		{#if description}
			<Field.Description>{description}</Field.Description>
		{/if}
	</Field.Field>
{/snippet}

{#if command.type === "switch"}
	{@const current = command}
	<ChoiceRow
		label="Power"
		options={powerOptions}
		value={current.on ? "on" : "off"}
		onChange={(next) => (command = { type: "switch", on: next === "on" })}
	/>
{:else if command.type === "light"}
	{@const change = command.change}
	<ChoiceRow
		label="Power"
		options={powerOptions}
		value={change.on === false ? "off" : "on"}
		onChange={(next) =>
			(command = {
				type: "light",
				change: next === "on" ? { ...change, on: true } : { on: false },
			})}
	/>
	{#if change.on !== false}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{@render numberField(
				"brightness",
				"Brightness (%)",
				change.brightness,
				{ min: 1, max: 100 },
				(brightness) =>
					(command = { type: "light", change: { ...change, brightness } }),
			)}
			{@render numberField(
				"temperature",
				"White (kelvin)",
				change.temperature,
				{ min: 1000, max: 10_000, step: 100 },
				(temperature) =>
					(command = {
						type: "light",
						change: { ...change, temperature, color: undefined },
					}),
				"2700 is warm, 6500 cool.",
			)}
		</div>
	{/if}
{:else if command.type === "cover"}
	{@const move = command.move}
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
		value={"position" in move ? "position" : move.action}
		onChange={(next) =>
			(command = {
				type: "cover",
				move:
					next === "position"
						? { position: 50 }
						: { action: next === "open" ? "open" : "close" },
			})}
	/>
	{#if "position" in move}
		{@render numberField(
			"position",
			"Open (%)",
			move.position,
			{ min: 0, max: 100 },
			(position) =>
				(command = { type: "cover", move: { position: position ?? 50 } }),
		)}
	{/if}
{:else if command.type === "climate"}
	{@const change = command.change}
	<ChoiceRow
		label="Power"
		options={powerOptions}
		value={change.power === false ? "off" : "on"}
		onChange={(next) =>
			(command = {
				type: "climate",
				change: next === "on" ? { ...change, power: true } : { power: false },
			})}
	/>
	{#if change.power !== false}
		<ChoiceRow
			label="Mode"
			options={[
				{ value: "keep", label: "Keep mode" },
				...climateModes.map((mode) => ({
					value: mode,
					label: climateModeLabels[mode],
				})),
			]}
			value={change.mode ?? "keep"}
			onChange={(next) =>
				(command = {
					type: "climate",
					change: {
						...change,
						mode: climateModes.find((mode) => mode === next),
					},
				})}
		/>
		{@render numberField(
			"temperature",
			"Temperature (°C)",
			change.targetTemperature,
			{ min: 5, max: 35, step: 0.5 },
			(targetTemperature) =>
				(command = {
					type: "climate",
					change: { ...change, targetTemperature },
				}),
		)}
	{/if}
{:else if command.type === "valve"}
	{@render numberField(
		"target",
		"Temperature (°C)",
		command.target,
		{ min: 4, max: 35, step: 0.5 },
		(target) => (command = { type: "valve", target: target ?? 19 }),
	)}
{:else if command.type === "lock"}
	<ChoiceRow
		label="Lock"
		options={[
			{ value: "lock", label: "Lock", icon: LockIcon },
			{ value: "unlock", label: "Unlock", icon: LockOpenIcon },
		]}
		value={command.locked ? "lock" : "unlock"}
		onChange={(next) => (command = { type: "lock", locked: next === "lock" })}
	/>
{:else if command.type === "fan"}
	{@const change = command.change}
	<ChoiceRow
		label="Power"
		options={powerOptions}
		value={change.on === false ? "off" : "on"}
		onChange={(next) =>
			(command = {
				type: "fan",
				change: next === "on" ? { ...change, on: true } : { on: false },
			})}
	/>
	{#if change.on !== false}
		{@render numberField(
			"speed",
			"Speed (%)",
			change.speed,
			{ min: 1, max: 100 },
			(speed) => (command = { type: "fan", change: { ...change, speed } }),
		)}
	{/if}
{:else if command.type === "media"}
	{@const change = command.change}
	<ChoiceRow
		label="Do"
		options={[
			{ value: "on", label: "Turn on", icon: PowerIcon },
			{ value: "off", label: "Turn off", icon: PowerOffIcon },
			{ value: "play", label: "Play", icon: PlayIcon },
			{ value: "pause", label: "Pause", icon: PauseIcon },
			{ value: "next", label: "Next", icon: SkipForwardIcon },
		]}
		value={change.action ?? (change.power === false ? "off" : "on")}
		onChange={(next) =>
			(command = {
				type: "media",
				change:
					next === "on" || next === "off"
						? { power: next === "on", volume: change.volume }
						: { action: next as MediaAction },
			})}
	/>
	{#if change.power === true}
		{@render numberField(
			"volume",
			"Volume (%)",
			change.volume,
			{ min: 0, max: 100 },
			(volume) => (command = { type: "media", change: { ...change, volume } }),
		)}
	{/if}
{:else if command.type === "button"}
	<p class="text-muted-foreground text-sm">Presses it once.</p>
{:else if command.type === "printer"}
	<ChoiceRow
		label="Command"
		options={printerCommands.map((order) => ({
			value: order,
			label: commandLabels[order] ?? order,
			icon: commandIcons[order],
		}))}
		value={command.change.command ?? "pause"}
		onChange={(next) =>
			(command = {
				type: "printer",
				change: {
					command: printerCommands.find((order) => order === next),
				},
			})}
	/>
{:else if command.type === "vacuum"}
	<ChoiceRow
		label="Command"
		options={vacuumCommands.map((order) => ({
			value: order,
			label: commandLabels[order] ?? order,
			icon: commandIcons[order],
		}))}
		value={command.change.command ?? "start"}
		onChange={(next) =>
			(command = {
				type: "vacuum",
				change: { command: vacuumCommands.find((order) => order === next) },
			})}
	/>
{/if}
