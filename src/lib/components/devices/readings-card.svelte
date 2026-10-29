<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import {
		readAgo,
		type SensorReading,
		type SensorState,
	} from "#lib/devices.js";

	interface Props {
		name: string;
		reading: SensorState | null;
		error: string | null;
		readAt: Date | null;
		now: number;
		compact?: boolean;
		onMore?: () => void;
	}

	const {
		name,
		reading,
		error,
		readAt,
		now,
		compact = false,
		onMore,
	}: Props = $props();

	const ago = $derived(readAgo(readAt, now));
	const main = $derived(reading?.readings[0] ?? null);
	const rest = $derived(reading?.readings.slice(1) ?? []);

	function format(entry: SensorReading): string {
		if (entry.value === null) {
			return "--";
		}
		if (typeof entry.value === "boolean") {
			return entry.value ? "Yes" : "No";
		}
		const value =
			typeof entry.value === "number"
				? entry.value.toLocaleString(undefined, { maximumFractionDigits: 1 })
				: entry.value;
		return entry.unit ? `${value} ${entry.unit}` : value;
	}
</script>

<article class="glass flex flex-col gap-3 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
				aria-hidden="true"
			>
				<ActivityIcon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground truncate text-sm">
				{#if error}
					<span class="text-destructive">{error}</span>
				{:else if !main}
					Not read yet
				{:else}
					{main.name}
				{/if}
			</p>
		</div>
		{#if main}
			<p class="font-display text-2xl font-semibold tabular-nums">
				{format(main)}
			</p>
		{/if}
		<CardMore {name} onclick={onMore} />
	</header>
	{#if rest.length > 0 && !compact}
		<dl class="grid grid-cols-2 gap-2">
			{#each rest as entry (entry.name)}
				<div class="bg-muted/60 rounded-xl px-3 py-2">
					<dt class="text-muted-foreground truncate text-xs">{entry.name}</dt>
					<dd class="font-medium tabular-nums">{format(entry)}</dd>
				</div>
			{/each}
		</dl>
	{/if}
	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>
