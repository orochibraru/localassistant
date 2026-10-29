<script lang="ts">
	import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
	import { onDestroy } from "svelte";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import { Slider } from "#lib/components/ui/slider/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import {
		type LightChange,
		type LightColor,
		type LightState,
		readAgo,
	} from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlLight } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: LightState | null;
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

	const swatches: (LightColor & { label: string })[] = [
		{ label: "Red", hue: 0, saturation: 90 },
		{ label: "Orange", hue: 30, saturation: 90 },
		{ label: "Yellow", hue: 55, saturation: 85 },
		{ label: "Green", hue: 120, saturation: 70 },
		{ label: "Blue", hue: 220, saturation: 85 },
		{ label: "Purple", hue: 280, saturation: 75 },
	];

	const pending = new PendingChanges<LightChange>({
		delayMs: 300,
		send: async (change) => {
			await controlLight({ deviceId: id, ...change });
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});
	onDestroy(() => void pending.flush());

	const shown = $derived(reading ? { ...reading, ...pending.values } : null);
	const on = $derived(shown?.on ?? false);
	let brightness = $derived(shown?.brightness ?? 100);
	let temperature = $derived(
		shown?.temperature ?? shown?.minTemperature ?? 2700,
	);
	const ago = $derived(readAgo(readAt, now));
	const status = $derived.by(() => {
		if (!shown || shown.on === null) {
			return "Not read yet";
		}
		if (!shown.on) {
			return "Off";
		}
		return shown.brightness === null
			? "On"
			: `On, ${Math.round(shown.brightness)}%`;
	});
</script>

<article class="glass flex flex-col gap-4 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="flex size-10 shrink-0 items-center justify-center rounded-xl {on
					? 'bg-primary text-primary-foreground'
					: 'bg-accent text-accent-foreground'}"
				aria-hidden="true"
			>
				<LightbulbIcon class="size-5" />
			</span>
		{/if}
		<label for="{id}-power" class="min-w-0 flex-1 cursor-pointer">
			<span class="block truncate font-semibold">{name}</span>
			<span class="text-muted-foreground block text-sm">
				{#if pending.error ?? error}
					<span class="text-destructive">{pending.error ?? error}</span>
				{:else}
					{status}
				{/if}
			</span>
		</label>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
		<Switch
			id="{id}-power"
			checked={on}
			disabled={!shown || shown.on === null}
			onCheckedChange={(next) => pending.set({ on: next })}
		/>
		<CardMore {name} onclick={onMore} />
	</header>

	{#if shown && on && !compact}
		{#if shown.features.includes("brightness")}
			<Slider
				type="single"
				bind:value={brightness}
				min={1}
				max={100}
				step={1}
				aria-label="{name} brightness"
				onValueCommit={(next) => pending.set({ brightness: next })}
			/>
		{/if}
		{#if shown.features.includes("temperature")}
			<div class="flex flex-col gap-1">
				<Slider
					type="single"
					bind:value={temperature}
					min={shown.minTemperature}
					max={shown.maxTemperature}
					step={50}
					aria-label="{name} colour temperature"
					onValueCommit={(next) => pending.set({ temperature: next })}
				/>
				<p class="text-muted-foreground flex justify-between text-xs">
					<span>Warm</span><span>{temperature} K</span><span>Cool</span>
				</p>
			</div>
		{/if}
		{#if shown.features.includes("color")}
			<div class="flex flex-wrap gap-2" role="group" aria-label="{name} colour">
				{#each swatches as swatch (swatch.label)}
					<button
						type="button"
						class="border-border size-11 rounded-full border-2 transition-transform active:scale-95 {shown
							.color?.hue === swatch.hue
							? 'ring-ring ring-2 ring-offset-2'
							: ''}"
						style="background-color: hsl({swatch.hue} {swatch.saturation}% 50%)"
						aria-label="{swatch.label} light"
						aria-pressed={shown.color?.hue === swatch.hue}
						onclick={() =>
							pending.set({
								color: { hue: swatch.hue, saturation: swatch.saturation },
							})}
					></button>
				{/each}
			</div>
		{/if}
	{/if}

	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>
