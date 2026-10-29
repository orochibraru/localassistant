<script lang="ts">
	import HeaterIcon from "@lucide/svelte/icons/heater";
	import MinusIcon from "@lucide/svelte/icons/minus";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { onDestroy } from "svelte";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { readAgo, type ValveState } from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlValve } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: ValveState | null;
		readAt: Date | null;
		now: number;
		compact?: boolean;
		onMore?: () => void;
	}

	const {
		id,
		name,
		reading,
		readAt,
		now,
		compact = false,
		onMore,
	}: Props = $props();

	const pending = new PendingChanges<{ target: number }>({
		send: async ({ target }) => {
			if (target !== undefined) {
				await controlValve({ deviceId: id, target });
			}
		},
		describe: (failure) =>
			toastError(failure, `${name} didn't take the change.`),
	});
	onDestroy(() => void pending.flush());

	const target = $derived(pending.values.target ?? reading?.target ?? null);
	const ago = $derived(readAgo(readAt, now));

	function nudge(delta: number) {
		if (!reading || target === null) {
			return;
		}
		pending.set({
			target: Math.min(reading.max, Math.max(reading.min, target + delta)),
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
				<HeaterIcon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground text-sm">
				{#if pending.error}
					<span class="text-destructive">{pending.error}</span>
				{:else if reading?.heldBy}
					Closed while {reading.heldBy} is open
				{:else if reading?.temperature != null}
					{reading.temperature}° in the room
				{:else}
					Waiting for its first report
				{/if}
			</p>
		</div>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
		<CardMore {name} onclick={onMore} />
	</header>
	<div class="flex items-center justify-between gap-3">
		<IconButton
			label="Lower {name}"
			icon={MinusIcon}
			variant="secondary"
			disabled={target === null}
			onclick={() => nudge(-0.5)}
		/>
		<p class="text-center">
			<span class="font-display block text-4xl font-semibold tabular-nums"
				>{target === null ? "--" : `${target}°`}</span
			>
			<span class="text-muted-foreground text-xs">target</span>
		</p>
		<IconButton
			label="Raise {name}"
			icon={PlusIcon}
			variant="secondary"
			disabled={target === null}
			onclick={() => nudge(0.5)}
		/>
	</div>
	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">
			Reported {ago}{reading?.battery != null
				? `, battery ${reading.battery}%`
				: ""}
		</p>
	{/if}
</article>
