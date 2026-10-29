<script lang="ts">
	import BlindsIcon from "@lucide/svelte/icons/blinds";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
	import SquareIcon from "@lucide/svelte/icons/square";
	import { onDestroy } from "svelte";

	import DeviceSettings from "#lib/components/devices/device-settings.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Slider } from "#lib/components/ui/slider/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import {
		type CoverAction,
		type CoverMove,
		type CoverState,
		readAgo,
	} from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlCover, moveCover } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: CoverState | null;
		error: string | null;
		readAt: Date | null;
		now: number;
	}

	const { id, name, reading, error, readAt, now }: Props = $props();

	const actionTargets: Record<CoverAction, number | null> = {
		open: 100,
		close: 0,
		stop: null,
	};

	let moving = $state<{ target: number; since: number | null } | null>(null);

	const pending = new PendingChanges<{ move: CoverMove }>({
		delayMs: 400,
		send: async ({ move }) => {
			if (!move) {
				return;
			}
			if ("action" in move) {
				await controlCover({ deviceId: id, action: move.action });
			} else {
				await moveCover({ deviceId: id, position: move.position });
			}
			const next = targetOf(move);
			moving =
				next === null
					? null
					: { target: next, since: readAt?.getTime() ?? null };
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});
	onDestroy(() => void pending.flush());

	const remembered = $derived(
		moving && moving.since === (readAt?.getTime() ?? null)
			? moving.target
			: null,
	);
	const target = $derived(
		pending.values.move ? targetOf(pending.values.move) : remembered,
	);
	let position = $derived(target ?? reading?.position ?? 0);
	const ago = $derived(readAgo(readAt, now));

	function targetOf(move: CoverMove): number | null {
		return "position" in move ? move.position : actionTargets[move.action];
	}

	function describe(value: number): string {
		if (value === 0) {
			return "Closed";
		}
		return value === 100 ? "Open" : `${value}% open`;
	}

	function describeTarget(value: number): string {
		if (value === 0) {
			return "Closing";
		}
		return value === 100 ? "Opening" : `Moving to ${value}%`;
	}
</script>

<article class="glass flex flex-col gap-4 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		<span
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			aria-hidden="true"
		>
			<BlindsIcon class="size-5" />
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground text-sm">
				{#if pending.error}
					<span class="text-destructive">{pending.error}</span>
				{:else if target !== null}
					{describeTarget(target)}
				{:else if error}
					<span class="text-destructive">{error}</span>
				{:else if reading?.position === null || !reading}
					Position unknown
				{:else}
					{describe(reading.position)}
				{/if}
			</p>
		</div>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
		<DeviceSettings {id} {name} />
	</header>

	<Slider
		type="single"
		bind:value={position}
		min={0}
		max={100}
		step={5}
		aria-label="{name} position"
		onValueCommit={(next) => pending.set({ move: { position: next } })}
	/>

	<div class="flex justify-between gap-2">
		<IconButton
			label="Open {name}"
			icon={ChevronUpIcon}
			variant="secondary"
			class="flex-1 rounded-xl md:h-11 md:flex-1"
			onclick={() => pending.set({ move: { action: "open" } })}
		/>
		<IconButton
			label="Stop {name}"
			icon={SquareIcon}
			variant="secondary"
			class="flex-1 rounded-xl md:h-11 md:flex-1"
			onclick={() => pending.set({ move: { action: "stop" } })}
		/>
		<IconButton
			label="Close {name}"
			icon={ChevronDownIcon}
			variant="secondary"
			class="flex-1 rounded-xl md:h-11 md:flex-1"
			onclick={() => pending.set({ move: { action: "close" } })}
		/>
	</div>

	{#if ago}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>
