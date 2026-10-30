<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import DropletIcon from "@lucide/svelte/icons/droplet";
	import MinusIcon from "@lucide/svelte/icons/minus";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PowerIcon from "@lucide/svelte/icons/power";
	import ThermometerIcon from "@lucide/svelte/icons/thermometer";
	import { onDestroy } from "svelte";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import {
		type ClimateChange,
		type ClimateMode,
		climateModeLabels,
		type ClimateState,
		readAgo,
	} from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlClimate } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: ClimateState | null;
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

	const step = 0.5;

	const pending = new PendingChanges<ClimateChange>({
		send: async (change) => {
			await controlClimate({ deviceId: id, ...change });
			await invalidateAll();
		},
		describe: (failure) =>
			toastError(failure, `${name} didn't take the change.`),
	});
	onDestroy(() => void pending.flush());

	const shown = $derived(reading ? { ...reading, ...pending.values } : null);
	let mode = $derived<string>(shown?.mode ?? "");
	const ago = $derived(readAgo(readAt, now));
	const boost = $derived(
		pending.values.hotWaterBoost ?? shown?.hotWater?.boost ?? false,
	);

	function handleMode(next: ClimateMode | "") {
		if (!next) {
			mode = shown?.mode ?? "";
			return;
		}
		if (next !== shown?.mode) {
			pending.set({ mode: next });
		}
	}

	function handleTarget(delta: number) {
		if (!shown || shown.targetTemperature === null) {
			return;
		}
		pending.set({
			targetTemperature: Math.min(
				shown.maxTemperature,
				Math.max(shown.minTemperature, shown.targetTemperature + delta),
			),
		});
	}
</script>

<article class="glass flex flex-col gap-4 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
				aria-hidden="true"
			>
				<ThermometerIcon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground text-sm">
				{#if pending.error ?? error}
					<span class="text-destructive">{pending.error ?? error}</span>
				{:else if !reading}
					Not read yet
				{:else if reading.offline}
					The unit is offline in MELCloud
				{:else}
					{reading.roomTemperature === null
						? "Room temperature unknown"
						: `${reading.roomTemperature}° in the room`}
				{/if}
			</p>
		</div>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
		{#if shown}
			<IconButton
				label={shown.power ? `Turn ${name} off` : `Turn ${name} on`}
				icon={PowerIcon}
				variant={shown.power ? "default" : "secondary"}
				onclick={() => pending.set({ power: !shown.power })}
			/>
		{/if}
		<CardMore {name} onclick={onMore} />
	</header>

	{#if shown}
		<div class="flex items-center justify-between gap-3">
			<IconButton
				label="Lower {name}"
				icon={MinusIcon}
				variant="secondary"
				disabled={shown.targetTemperature === null}
				onclick={() => handleTarget(-step)}
			/>
			<div class="flex items-end justify-center gap-4">
				<p class="text-center">
					<span class="font-display block text-4xl font-semibold tabular-nums">
						{shown.targetTemperature === null
							? "--"
							: `${shown.targetTemperature}°`}
					</span>
					<span class="text-muted-foreground text-xs">target</span>
				</p>
				{#if shown.roomTemperature !== null}
					<p class="border-border border-l pl-4 text-center">
						<span
							class="font-display text-muted-foreground block text-2xl font-semibold tabular-nums"
						>
							{shown.roomTemperature}°
						</span>
						<span class="text-muted-foreground text-xs">room</span>
					</p>
				{/if}
			</div>
			<IconButton
				label="Raise {name}"
				icon={PlusIcon}
				variant="secondary"
				disabled={shown.targetTemperature === null}
				onclick={() => handleTarget(step)}
			/>
		</div>

		{#if shown.hotWater && !compact}
			<div class="bg-muted/60 flex min-h-14 items-center gap-3 rounded-xl px-3">
				<DropletIcon class="text-muted-foreground size-5 shrink-0" />
				<label for="{id}-boost" class="min-w-0 flex-1 cursor-pointer py-2">
					<span class="block font-medium">Boost hot water</span>
					<span class="text-muted-foreground block text-sm">
						{shown.hotWater.temperature}° in the tank{shown.hotWater.target ===
						null
							? ""
							: `, ${shown.hotWater.target}° target`}
					</span>
				</label>
				<Switch
					id="{id}-boost"
					checked={boost}
					onCheckedChange={(next) => pending.set({ hotWaterBoost: next })}
				/>
			</div>
		{/if}

		{#if shown.modes.length > 0 && !compact}
			<ToggleGroup.Root
				type="single"
				bind:value={mode}
				spacing={2}
				aria-label="{name} mode"
				class="w-full flex-wrap"
				onValueChange={(next) => handleMode(next as ClimateMode | "")}
			>
				{#each shown.modes as option (option)}
					<ToggleGroup.Item
						value={option}
						class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 rounded-xl"
						>{climateModeLabels[option]}</ToggleGroup.Item
					>
				{/each}
			</ToggleGroup.Root>
		{/if}
	{/if}

	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>
