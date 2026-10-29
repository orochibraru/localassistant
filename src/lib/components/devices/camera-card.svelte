<script lang="ts">
	import { resolve } from "$app/paths";
	import CctvIcon from "@lucide/svelte/icons/cctv";
	import CircleIcon from "@lucide/svelte/icons/circle";

	import { type CameraState, readAgo } from "#lib/devices.js";

	interface Props {
		id: string;
		name: string;
		frigateName: string | null;
		reading: CameraState | null;
		error: string | null;
		now: number;
	}

	const { id, name, frigateName, reading, error, now }: Props = $props();

	const snapshot = $derived(
		frigateName
			? `/frigate/${encodeURIComponent(frigateName)}/latest.jpg?at=${Math.floor(now / 10_000)}`
			: null,
	);
	const status = $derived.by(() => {
		if (frigateName) {
			return "Frigate";
		}
		if (!reading?.streaming) {
			return "Offline";
		}
		return reading.recording ? "Live, recording" : "Live";
	});
</script>

<a
	href={resolve("/(protected)/cameras/[deviceId]", { deviceId: id })}
	class="glass flex flex-col gap-3 rounded-2xl p-4 transition-transform duration-200 active:scale-[0.98]"
>
	{#if snapshot}
		<img
			src={snapshot}
			alt="{name}, latest picture"
			class="aspect-video w-full rounded-xl bg-black object-cover"
			loading="lazy"
		/>
	{/if}
	<div class="flex items-center gap-3">
		<span
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			aria-hidden="true"
		>
			<CctvIcon class="size-5" />
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
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
	</div>
</a>
