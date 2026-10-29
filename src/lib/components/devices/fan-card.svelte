<script lang="ts">
	import FanIcon from "@lucide/svelte/icons/fan";
	import { onDestroy } from "svelte";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import { Slider } from "#lib/components/ui/slider/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { type FanChange, type FanState, readAgo } from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlFan } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: FanState | null;
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

	const pending = new PendingChanges<FanChange>({
		delayMs: 300,
		send: async (change) => {
			await controlFan({ deviceId: id, ...change });
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});
	onDestroy(() => void pending.flush());

	const shown = $derived(reading ? { ...reading, ...pending.values } : null);
	const on = $derived(shown?.on ?? false);
	const step = $derived(
		shown && shown.speedSteps > 0 ? 100 / shown.speedSteps : 1,
	);
	let speed = $derived(shown?.speed ?? 0);
	const ago = $derived(readAgo(readAt, now));
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
				<FanIcon class="size-5" />
			</span>
		{/if}
		<label for="{id}-power" class="min-w-0 flex-1 cursor-pointer">
			<span class="block truncate font-semibold">{name}</span>
			<span class="text-muted-foreground block text-sm">
				{#if pending.error ?? error}
					<span class="text-destructive">{pending.error ?? error}</span>
				{:else if !shown || shown.on === null}
					Not read yet
				{:else if !on}
					Off
				{:else}
					On{shown.speed === null ? "" : `, ${Math.round(shown.speed)}%`}
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
		{#if shown.speed !== null}
			<Slider
				type="single"
				bind:value={speed}
				min={step}
				max={100}
				{step}
				aria-label="{name} speed"
				onValueCommit={(next) => pending.set({ speed: next })}
			/>
		{/if}
		{#if shown.oscillating !== null}
			<div class="bg-muted/60 flex min-h-14 items-center gap-3 rounded-xl px-3">
				<label for="{id}-oscillate" class="min-w-0 flex-1 cursor-pointer py-2"
					>Oscillate</label
				>
				<Switch
					id="{id}-oscillate"
					checked={shown.oscillating}
					onCheckedChange={(next) => pending.set({ oscillating: next })}
				/>
			</div>
		{/if}
	{/if}

	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>
