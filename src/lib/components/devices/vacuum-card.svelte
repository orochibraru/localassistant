<script lang="ts">
	import BlendIcon from "@lucide/svelte/icons/blend";
	import BotIcon from "@lucide/svelte/icons/bot";
	import DropletsIcon from "@lucide/svelte/icons/droplets";
	import FanIcon from "@lucide/svelte/icons/fan";
	import FeatherIcon from "@lucide/svelte/icons/feather";
	import FlaskConicalIcon from "@lucide/svelte/icons/flask-conical";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import GlassWaterIcon from "@lucide/svelte/icons/glass-water";
	import HouseIcon from "@lucide/svelte/icons/house";
	import PackageIcon from "@lucide/svelte/icons/package";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import SquareIcon from "@lucide/svelte/icons/square";
	import WavesIcon from "@lucide/svelte/icons/waves";
	import WindIcon from "@lucide/svelte/icons/wind";
	import ZapIcon from "@lucide/svelte/icons/zap";
	import { type Component, onDestroy } from "svelte";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Slider } from "#lib/components/ui/slider/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import {
		dockStatusLabels,
		readAgo,
		type VacuumChange,
		type VacuumCommand,
		type VacuumDock,
		type VacuumMode,
		vacuumModeLabels,
		vacuumModes,
		type VacuumPart,
		vacuumPartLabels,
		vacuumParts,
		type VacuumStage,
		type VacuumState,
		type VacuumSuction,
		vacuumSuctionLabels,
		vacuumSuctions,
		vacuumWetness,
	} from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlVacuum } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: VacuumState | null;
		error: string | null;
		readAt: Date | null;
		now: number;
		compact?: boolean;
		onMore?: () => void;
	}

	const {
		id,
		name,
		reading,
		error,
		readAt,
		now,
		compact = false,
		onMore,
	}: Props = $props();

	const stageLabels: Record<VacuumStage, string> = {
		cleaning: "Cleaning",
		idle: "Idle",
		paused: "Paused",
		returning: "Going back to the dock",
		charging: "Charging",
		docked: "Docked, charged",
		washing: "Washing its mops",
		drying: "Drying its mops",
		error: "Needs a hand",
	};

	const commandStages: Record<VacuumCommand, VacuumStage> = {
		start: "cleaning",
		pause: "paused",
		dock: "returning",
		stop: "idle",
	};

	const modeIcons: Record<VacuumMode, Component<{ class?: string }>> = {
		vacuum: WindIcon,
		mop: DropletsIcon,
		both: BlendIcon,
	};

	const suctionIcons: Record<VacuumSuction, Component<{ class?: string }>> = {
		quiet: FeatherIcon,
		standard: FanIcon,
		strong: GaugeIcon,
		max: ZapIcon,
	};

	const dockItems: {
		key: keyof VacuumDock;
		label: string;
		icon: Component<{ class?: string }>;
	}[] = [
		{ key: "cleanWater", label: "Clean water", icon: GlassWaterIcon },
		{ key: "dirtyWater", label: "Dirty water", icon: WavesIcon },
		{ key: "dustBag", label: "Dust bag", icon: PackageIcon },
		{ key: "detergent", label: "Detergent cartridge", icon: FlaskConicalIcon },
	];

	let resetting = $state<VacuumPart | null>(null);
	const resetSheet = {
		get open() {
			return resetting !== null;
		},
		set open(value: boolean) {
			if (!value) {
				resetting = null;
			}
		},
	};

	let expected = $state<{ change: VacuumChange; since: number | null } | null>(
		null,
	);

	const pending = new PendingChanges<VacuumChange>({
		delayMs: 300,
		send: async (change) => {
			await controlVacuum({ deviceId: id, ...change });
			expected = { change, since: readAt?.getTime() ?? null };
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});

	onDestroy(() => void pending.flush());

	const stillExpected = $derived(
		expected && expected.since === (readAt?.getTime() ?? null)
			? expected.change
			: {},
	);
	const shown = $derived(
		reading ? apply(apply(reading, stillExpected), pending.values) : null,
	);
	const smart = $derived(shown?.cleanGenius === true);
	let mode = $derived<string>(shown?.mode ?? "");
	let suction = $derived<string>(shown?.suction ?? "");
	let wetness = $derived(shown?.wetness ?? vacuumWetness.min);
	const parts = $derived(
		shown
			? vacuumParts.flatMap((part) => {
					const left = shown.partsLeft[part];
					return left === null ? [] : [{ part, left }];
				})
			: [],
	);
	const dock = $derived(
		shown
			? dockItems.flatMap((item) => {
					const status = shown.dock[item.key];
					return status === null ? [] : [{ ...item, status }];
				})
			: [],
	);
	const ago = $derived(readAgo(readAt, now));

	function apply(state: VacuumState, change: VacuumChange): VacuumState {
		return {
			...state,
			stage: change.command ? commandStages[change.command] : state.stage,
			mode: change.mode ?? state.mode,
			suction: change.suction ?? state.suction,
			wetness: change.wetness ?? state.wetness,
			cleanGenius: change.cleanGenius ?? state.cleanGenius,
			partsLeft: change.reset
				? { ...state.partsLeft, [change.reset]: 100 }
				: state.partsLeft,
		};
	}

	function confirmReset() {
		if (resetting) {
			pending.set({ reset: resetting });
			void pending.flush();
		}
		resetting = null;
	}

	function handleMode(next: string) {
		if (!next) {
			mode = shown?.mode ?? "";
			return;
		}
		if (next !== shown?.mode) {
			pending.set({ mode: next as VacuumMode });
		}
	}

	function handleSuction(next: string) {
		if (!next) {
			suction = shown?.suction ?? "";
			return;
		}
		if (next !== shown?.suction) {
			pending.set({ suction: next as VacuumSuction });
		}
	}
</script>

<article class="glass @container flex flex-col gap-4 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
				aria-hidden="true"
			>
				<BotIcon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground text-sm">
				{#if pending.error ?? error}
					<span class="text-destructive">{pending.error ?? error}</span>
				{:else if shown}
					{stageLabels[shown.stage]}{shown.battery === null
						? ""
						: `, ${shown.battery}%`}{#if shown.errorCode}
						<span class="text-destructive">
							· {shown.errorText ?? `error ${shown.errorCode}`}</span
						>{/if}
				{:else}
					Not read yet
				{/if}
			</p>
		</div>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
		<CardMore {name} onclick={onMore} />
	</header>

	<div class="flex gap-2">
		{#if shown?.stage === "cleaning"}
			<Button
				variant="secondary"
				class="h-11 min-w-0 flex-2 rounded-xl"
				onclick={() => pending.set({ command: "pause" })}
				><PauseIcon />Pause</Button
			>
		{:else}
			<Button
				variant={smart ? "default" : "secondary"}
				class="h-11 min-w-0 flex-2 rounded-xl"
				aria-label={smart ? `Start ${name} with CleanGenius` : `Start ${name}`}
				onclick={() => pending.set({ command: "start" })}
			>
				{#if smart}<SparklesIcon />CleanGenius{:else}<PlayIcon />Start{/if}
			</Button>
		{/if}
		<IconButton
			label="Stop {name}"
			icon={SquareIcon}
			variant="secondary"
			class="flex-1 rounded-xl md:h-11 md:flex-1"
			onclick={() => pending.set({ command: "stop" })}
		/>
		<IconButton
			label="Send {name} to its dock"
			icon={HouseIcon}
			variant="secondary"
			class="flex-1 rounded-xl md:h-11 md:flex-1"
			onclick={() => pending.set({ command: "dock" })}
		/>
	</div>

	{#if shown && !compact}
		<div class="grid gap-4 @xl:grid-cols-2">
			<div class="@container flex min-w-0 flex-col gap-4">
				{#if shown.cleanGenius !== null}
					<div
						class="bg-muted/60 flex min-h-14 items-center gap-3 rounded-xl px-3"
					>
						<SparklesIcon class="text-muted-foreground size-5 shrink-0" />
						<label for="{id}-clean-genius" class="min-w-0 flex-1 py-2">
							<span class="block font-medium">CleanGenius</span>
							<span class="text-muted-foreground block text-sm"
								>{smart
									? "The robot picks the mode, suction and water per room"
									: "Cleans with the settings below"}</span
							>
						</label>
						<Switch
							id="{id}-clean-genius"
							checked={smart}
							onCheckedChange={(next) => pending.set({ cleanGenius: next })}
						/>
					</div>
				{/if}

				{#if !smart && shown.mode}
					<ToggleGroup.Root
						type="single"
						bind:value={mode}
						spacing={2}
						aria-label="{name} cleaning mode"
						class="w-full"
						onValueChange={handleMode}
					>
						{#each vacuumModes as option (option)}
							{@const Icon = modeIcons[option]}
							<ToggleGroup.Item
								value={option}
								class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 min-w-0 flex-1 rounded-xl"
								><Icon /><span class="min-w-0 truncate"
									>{vacuumModeLabels[option]}</span
								></ToggleGroup.Item
							>
						{/each}
					</ToggleGroup.Root>
				{/if}

				{#if !smart && shown.suction && shown.mode !== "mop"}
					<ToggleGroup.Root
						type="single"
						bind:value={suction}
						spacing={2}
						aria-label="{name} suction"
						class="grid w-full grid-cols-2 @sm:grid-cols-4"
						onValueChange={handleSuction}
					>
						{#each vacuumSuctions as level (level)}
							{@const Icon = suctionIcons[level]}
							<ToggleGroup.Item
								value={level}
								class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 min-w-0 rounded-xl"
								><Icon /><span class="min-w-0 truncate"
									>{vacuumSuctionLabels[level]}</span
								></ToggleGroup.Item
							>
						{/each}
					</ToggleGroup.Root>
				{/if}

				{#if !smart && shown.wetness !== null && shown.mode !== "vacuum"}
					<div class="flex flex-col gap-1">
						<p class="flex items-center justify-between gap-2 text-sm">
							<span class="flex items-center gap-2"
								><DropletsIcon class="text-muted-foreground size-4" />Mop
								wetness</span
							>
							<span class="text-muted-foreground tabular-nums"
								>{wetness} / {vacuumWetness.max}</span
							>
						</p>
						<Slider
							type="single"
							bind:value={wetness}
							min={vacuumWetness.min}
							max={vacuumWetness.max}
							step={1}
							aria-label="{name} mop wetness"
							class="h-11"
							onValueCommit={(next) => {
								if (next !== shown.wetness) {
									pending.set({ wetness: next });
								}
							}}
						/>
					</div>
				{/if}
			</div>

			<div class="flex flex-col gap-3">
				{#if dock.length > 0}
					<dl class="grid grid-cols-2 gap-3 text-sm">
						{#each dock as item (item.key)}
							<div
								class="bg-muted/60 flex items-center gap-2 rounded-xl px-3 py-2"
							>
								<item.icon class="text-muted-foreground size-4 shrink-0" />
								<div class="min-w-0">
									<dt class="text-muted-foreground truncate text-xs">
										{item.label}
									</dt>
									<dd
										class="font-medium {item.status === 'ok'
											? ''
											: 'text-destructive'}"
									>
										{dockStatusLabels[item.status]}
									</dd>
								</div>
							</div>
						{/each}
					</dl>
				{/if}

				{#if shown.lastCleanMinutes !== null || parts.length > 0}
					<dl class="grid grid-cols-2 gap-3 text-sm">
						{#if shown.lastCleanMinutes !== null}
							<div class="bg-muted/60 rounded-xl px-3 py-2">
								<dt class="text-muted-foreground text-xs">Last clean</dt>
								<dd class="font-medium tabular-nums">
									{shown.lastCleanMinutes} min{shown.lastCleanArea === null
										? ""
										: `, ${shown.lastCleanArea} m²`}
								</dd>
							</div>
						{/if}
						{#each parts as { part, left } (part)}
							<div
								class="bg-muted/60 flex items-center gap-1 rounded-xl py-1 pr-1 pl-3"
							>
								<div class="min-w-0 flex-1">
									<dt class="text-muted-foreground truncate text-xs">
										{vacuumPartLabels[part]}
									</dt>
									<dd
										class="font-medium tabular-nums {left <= 10
											? 'text-destructive'
											: ''}"
									>
										{left}% left
									</dd>
								</div>
								<IconButton
									label="Reset the {vacuumPartLabels[
										part
									].toLowerCase()} wear on {name}"
									icon={RotateCcwIcon}
									variant="ghost"
									class="text-muted-foreground shrink-0"
									onclick={() => (resetting = part)}
								/>
							</div>
						{/each}
					</dl>
				{/if}
			</div>
		</div>
	{/if}

	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>

<ResponsiveSheet
	bind:open={resetSheet.open}
	title="Reset the {resetting
		? vacuumPartLabels[resetting].toLowerCase()
		: 'part'} on {name}?"
	description="Do it once a new one is in: the robot counts its wear from 100% again, and it can't be undone."
>
	<div class="flex flex-col gap-3 pb-6 md:flex-row-reverse">
		<Button class="h-11 rounded-xl px-5" onclick={confirmReset}
			><RotateCcwIcon />Reset it</Button
		>
		<Button
			variant="secondary"
			class="h-11 rounded-xl px-5"
			onclick={() => (resetting = null)}>Keep counting</Button
		>
	</div>
</ResponsiveSheet>
