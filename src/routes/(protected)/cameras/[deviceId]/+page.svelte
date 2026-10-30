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

	const media = (path: string) => `/media/${data.camera.id}/${path}`;
	const timeFormat = new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
	const dayFormat = new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
	const days = $derived(
		Object.entries(
			Object.groupBy(data.clips.clips, (clip) =>
				dayFormat.format(new Date(clip.startedAt)),
			),
		),
	);

	function play(clip: {
		video: string | null;
		label: string;
		startedAt: string;
	}) {
		if (clip.video) {
			playing = {
				src: media(clip.video),
				label: `${clip.label || data.camera.name}, ${timeFormat.format(new Date(clip.startedAt))}`,
			};
		}
	}
</script>

<div
	class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)] xl:items-start"
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
		{:else if data.live?.format === "hls"}
			<HlsPlayer src={media(data.live.path)} label="{data.camera.name}, live" />
		{:else if data.live}
			<img
				src={media(data.live.path)}
				alt="{data.camera.name}, live"
				class="aspect-video w-full rounded-2xl bg-black object-contain"
			/>
		{/if}
	</section>

	<section
		class="glass flex flex-col gap-4 rounded-2xl p-4"
		aria-labelledby="history-heading"
	>
		<h2 id="history-heading" class="font-semibold">{data.clips.title}</h2>
		{#if data.clipsError}
			<p class="text-destructive text-sm">{data.clipsError}</p>
		{:else if days.length === 0}
			<p class="text-muted-foreground text-sm">{data.clips.empty}</p>
		{/if}
		{#each days as [day, clips] (day)}
			<div class="flex flex-col gap-2">
				<h3 class="text-muted-foreground text-sm font-medium capitalize">
					{day}
				</h3>
				<ul class="flex flex-wrap gap-2">
					{#each clips ?? [] as clip (clip.id)}
						<li class={clip.image ? "w-[calc(50%-0.25rem)]" : ""}>
							{#if clip.image}
								<button
									type="button"
									class="flex w-full flex-col gap-1 text-left disabled:opacity-60"
									disabled={!clip.video}
									onclick={() => play(clip)}
								>
									<img
										src={media(clip.image)}
										alt=""
										class="aspect-video w-full rounded-xl bg-black object-cover"
										loading="lazy"
									/>
									<span class="text-sm font-medium capitalize"
										>{clip.label}</span
									>
									<span class="text-muted-foreground text-xs"
										>{timeFormat.format(new Date(clip.startedAt))}</span
									>
								</button>
							{:else}
								<button
									type="button"
									class="bg-secondary hover:bg-secondary/80 flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm tabular-nums disabled:opacity-60"
									title={clip.detail}
									disabled={!clip.video}
									onclick={() => play(clip)}
									><PlayIcon class="size-4" />{clip.label
										? `${clip.label}, `
										: ""}{timeFormat.format(new Date(clip.startedAt))}</button
								>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</section>
</div>
