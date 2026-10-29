<script lang="ts">
	import { resolve } from "$app/paths";
	import PlayIcon from "@lucide/svelte/icons/play";

	import HlsPlayer from "#lib/components/cameras/hls-player.svelte";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	setPageTitle(
		() => data.camera.name,
		() => resolve("/(protected)"),
	);

	let playing = $state<{ src: string; label: string } | null>(null);

	const timeFormat = new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
	const dayFormat = new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
	const frigateName = $derived(encodeURIComponent(data.camera.externalId));
	const days = $derived(
		Object.entries(
			Object.groupBy(data.recordings, (recording) =>
				dayFormat.format(new Date(recording.startedAt)),
			),
		),
	);
	const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;
</script>

<div
	class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)] xl:items-start"
>
	<section class="flex flex-col gap-3" aria-label="Live">
		{#if playing}
			<video
				src={playing.src}
				class="aspect-video w-full rounded-2xl bg-black"
				controls
				autoplay
				playsinline
				aria-label={playing.label}><track kind="captions" /></video
			>
			<button
				type="button"
				class="text-primary min-h-11 self-start text-sm font-medium"
				onclick={() => (playing = null)}>Back to live</button
			>
		{:else if data.camera.kind === "camera"}
			<HlsPlayer
				src="/cameras/{data.camera.id}/live/index.m3u8"
				label="{data.camera.name}, live"
			/>
		{:else}
			<img
				src="/frigate/{frigateName}/stream"
				alt="{data.camera.name}, live"
				class="aspect-video w-full rounded-2xl bg-black object-contain"
			/>
		{/if}
	</section>

	<section
		class="glass flex flex-col gap-4 rounded-2xl p-4"
		aria-labelledby="history-heading"
	>
		<h2 id="history-heading" class="font-semibold">
			{data.camera.kind === "camera" ? "Recordings" : "Events"}
		</h2>
		{#if data.camera.kind === "camera"}
			{#if days.length === 0}
				<p class="text-muted-foreground text-sm">
					Nothing recorded yet. Turn recording on in the camera's settings.
				</p>
			{/if}
			{#each days as [day, recordings] (day)}
				<div class="flex flex-col gap-1">
					<h3 class="text-muted-foreground text-sm font-medium capitalize">
						{day}
					</h3>
					<ul class="flex flex-wrap gap-2">
						{#each recordings ?? [] as recording (recording.file)}
							<li>
								<button
									type="button"
									class="bg-secondary hover:bg-secondary/80 flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm tabular-nums"
									title={megabytes(recording.bytes)}
									onclick={() =>
										(playing = {
											src: `/cameras/${data.camera.id}/recordings/${recording.file}`,
											label: `${data.camera.name}, ${timeFormat.format(new Date(recording.startedAt))}`,
										})}
									><PlayIcon class="size-4" />{timeFormat.format(
										new Date(recording.startedAt),
									)}</button
								>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		{:else if data.eventsError}
			<p class="text-destructive text-sm">{data.eventsError}</p>
		{:else if data.events.length === 0}
			<p class="text-muted-foreground text-sm">No event yet.</p>
		{:else}
			<ul class="grid grid-cols-2 gap-3">
				{#each data.events as event (event.id)}
					<li>
						<button
							type="button"
							class="flex w-full flex-col gap-1 text-left disabled:opacity-60"
							disabled={!event.hasClip}
							onclick={() =>
								(playing = {
									src: `/frigate/events/${event.id}/clip.mp4`,
									label: `${event.label}, ${timeFormat.format(new Date(event.startedAt))}`,
								})}
						>
							<img
								src="/frigate/events/{event.id}/thumbnail.jpg"
								alt=""
								class="aspect-video w-full rounded-xl bg-black object-cover"
								loading="lazy"
							/>
							<span class="text-sm font-medium capitalize">{event.label}</span>
							<span class="text-muted-foreground text-xs"
								>{dayFormat.format(new Date(event.startedAt))}, {timeFormat.format(
									new Date(event.startedAt),
								)}</span
							>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
