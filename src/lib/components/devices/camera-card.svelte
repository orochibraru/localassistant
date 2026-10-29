<script lang="ts">
	import { resolve } from "$app/paths";
	import CctvIcon from "@lucide/svelte/icons/cctv";
	import CircleIcon from "@lucide/svelte/icons/circle";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import { type CameraState, readAgo } from "#lib/devices.js";

	interface Props {
		id: string;
		name: string;
		reading: CameraState | null;
		error: string | null;
		now: number;
		compact?: boolean;
		onMore?: () => void;
	}

	const {
		id,
		name,
		reading,
		error,
		now,
		compact = false,
		onMore,
	}: Props = $props();

	const snapshot = $derived(
		reading?.snapshot
			? `/media/${id}/${reading.snapshot}?at=${Math.floor(now / 10_000)}`
			: null,
	);
	const status = $derived.by(() => {
		if (reading?.source) {
			return reading.source;
		}
		if (!reading?.streaming) {
			return "Offline";
		}
		return reading.recording ? "Live, recording" : "Live";
	});
</script>

<article class="glass relative flex flex-col gap-3 rounded-2xl p-4">
	{#if !compact}
		{#if snapshot}
			<img
				src={snapshot}
				alt="{name}, latest picture"
				class="aspect-video w-full rounded-xl bg-black object-cover"
				loading="lazy"
			/>
		{/if}
	{/if}
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
				aria-hidden="true"
			>
				<CctvIcon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">
				<a
					href={resolve("/(protected)/cameras/[deviceId]", { deviceId: id })}
					class="after:absolute after:inset-0 after:rounded-2xl">{name}</a
				>
			</h2>
			<p class="text-muted-foreground flex items-center gap-1.5 text-sm">
				{#if error}
					<span class="text-destructive">{error}</span>
				{:else}
					{#if reading?.recording}<CircleIcon
							class="fill-destructive text-destructive size-2.5"
						/>{/if}
					{status}{reading?.lastRecordingAt
						? `, last file ${readAgo(new Date(reading.lastRecordingAt), now)}`
						: ""}
				{/if}
			</p>
		</div>
		<CardMore {name} onclick={onMore} />
	</header>
</article>
