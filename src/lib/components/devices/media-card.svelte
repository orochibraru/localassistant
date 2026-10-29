<script lang="ts">
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PowerIcon from "@lucide/svelte/icons/power";
	import SkipBackIcon from "@lucide/svelte/icons/skip-back";
	import SkipForwardIcon from "@lucide/svelte/icons/skip-forward";
	import TvIcon from "@lucide/svelte/icons/tv";
	import Volume2Icon from "@lucide/svelte/icons/volume-2";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import { onDestroy } from "svelte";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import Picker from "#lib/components/picker.svelte";
	import { Slider } from "#lib/components/ui/slider/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { type MediaChange, type MediaState, readAgo } from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlMedia } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: MediaState | null;
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

	const pending = new PendingChanges<MediaChange>({
		delayMs: 250,
		send: async (change) => {
			await controlMedia({ deviceId: id, ...change });
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});
	onDestroy(() => void pending.flush());

	const shown = $derived(reading ? { ...reading, ...pending.values } : null);
	const power = $derived(shown?.power ?? false);
	const playing = $derived(
		pending.values.action === "play" ||
			(pending.values.action !== "pause" && shown?.playback === "playing"),
	);
	let volume = $derived(shown?.volume ?? 0);
	const ago = $derived(readAgo(readAt, now));
	const sourceOptions = $derived(
		(shown?.sources ?? []).map((source) => ({ value: source, label: source })),
	);
	const status = $derived.by(() => {
		if (!shown || shown.power === null) {
			return "Not read yet";
		}
		if (!shown.power) {
			return "Off";
		}
		if (shown.title) {
			return shown.artist ? `${shown.title}, ${shown.artist}` : shown.title;
		}
		return shown.playback === "playing"
			? "Playing"
			: shown.playback === "paused"
				? "Paused"
				: (shown.source ?? "On");
	});
</script>

<article class="glass flex flex-col gap-4 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="flex size-10 shrink-0 items-center justify-center rounded-xl {power
					? 'bg-primary text-primary-foreground'
					: 'bg-accent text-accent-foreground'}"
				aria-hidden="true"
			>
				<TvIcon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground truncate text-sm">
				{#if pending.error ?? error}
					<span class="text-destructive">{pending.error ?? error}</span>
				{:else}
					{status}
				{/if}
			</p>
		</div>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
		<IconButton
			label={power ? `Turn ${name} off` : `Turn ${name} on`}
			icon={PowerIcon}
			variant={power ? "default" : "secondary"}
			disabled={!shown || shown.power === null}
			onclick={() => pending.set({ power: !power })}
		/>
		<CardMore {name} onclick={onMore} />
	</header>

	{#if shown && power}
		<div class="flex items-center justify-center gap-3">
			<IconButton
				label="Previous on {name}"
				icon={SkipBackIcon}
				variant="secondary"
				onclick={() => pending.set({ action: "previous" })}
			/>
			<IconButton
				label={playing ? `Pause ${name}` : `Play ${name}`}
				icon={playing ? PauseIcon : PlayIcon}
				onclick={() => pending.set({ action: playing ? "pause" : "play" })}
			/>
			<IconButton
				label="Next on {name}"
				icon={SkipForwardIcon}
				variant="secondary"
				onclick={() => pending.set({ action: "next" })}
			/>
		</div>
		{#if shown.volume !== null && !compact}
			<div class="flex items-center gap-3">
				<IconButton
					label={shown.muted ? `Unmute ${name}` : `Mute ${name}`}
					icon={shown.muted ? VolumeXIcon : Volume2Icon}
					variant="secondary"
					onclick={() => pending.set({ muted: !shown.muted })}
				/>
				<Slider
					type="single"
					bind:value={volume}
					min={0}
					max={100}
					step={1}
					aria-label="{name} volume"
					class="flex-1"
					onValueCommit={(next) => pending.set({ volume: next })}
				/>
			</div>
		{/if}
		{#if sourceOptions.length > 1 && !compact}
			<Picker
				id="{id}-source"
				name="source"
				label="{name} source"
				options={sourceOptions}
				value={shown.source ?? ""}
				placeholder="Source"
				onPick={(next) => pending.set({ source: next })}
			/>
		{/if}
	{/if}

	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>
