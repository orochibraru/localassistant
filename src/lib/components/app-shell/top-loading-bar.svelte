<script lang="ts">
	import { navigating } from "$app/state";
	import { untrack } from "svelte";
	import { cubicOut } from "svelte/easing";
	import { Tween } from "svelte/motion";
	import { fade } from "svelte/transition";

	const progress = new Tween(0, { duration: 300, easing: cubicOut });

	let visible = $state(false);

	$effect(() => {
		const complete = navigating.complete;
		if (!complete) {
			return;
		}
		let creep: ReturnType<typeof setInterval> | undefined;
		untrack(() => {
			visible = true;
			void progress.set(0, { duration: 0 });
			creep = setInterval(() => {
				progress.target = progress.current + (0.9 - progress.current) * 0.15;
			}, 120);
		});
		void complete
			.catch(() => {})
			.then(async () => {
				clearInterval(creep);
				await progress.set(1);
				visible = false;
			});
		return () => clearInterval(creep);
	});
</script>

{#if visible}
	<div
		class="pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5"
		style="top: env(safe-area-inset-top)"
		role="progressbar"
		aria-label="Loading page"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={Math.round(progress.current * 100)}
		out:fade={{ duration: 200 }}
	>
		<div
			class="bg-primary h-full shadow-[0_0_8px_var(--primary)]"
			style="width: {progress.current * 100}%"
		></div>
	</div>
{/if}
