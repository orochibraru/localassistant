<script lang="ts">
	import { onMount } from "svelte";

	interface Props {
		src: string;
		label: string;
	}

	const { src, label }: Props = $props();

	let video: HTMLVideoElement | undefined = $state();
	let failed = $state<string | null>(null);

	onMount(() => {
		if (!video) {
			return;
		}
		if (video.canPlayType("application/vnd.apple.mpegurl")) {
			video.src = src;
			return;
		}
		let destroy: (() => void) | undefined;
		void import("hls.js").then(({ default: Hls }) => {
			if (!video || !Hls.isSupported()) {
				failed = "This browser can't play the live view.";
				return;
			}
			const hls = new Hls({ liveSyncDurationCount: 2 });
			hls.on(Hls.Events.ERROR, (_event, data) => {
				if (data.fatal) {
					failed = "The live view stopped: the camera may be offline.";
				}
			});
			hls.loadSource(src);
			hls.attachMedia(video);
			destroy = () => hls.destroy();
		});
		return () => destroy?.();
	});
</script>

<div class="relative overflow-hidden rounded-2xl bg-black">
	<video
		bind:this={video}
		class="aspect-video w-full"
		autoplay
		muted
		playsinline
		controls
		aria-label={label}
	></video>
	{#if failed}
		<p class="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-sm text-white">
			{failed}
		</p>
	{/if}
</div>
