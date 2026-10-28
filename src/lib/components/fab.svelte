<script lang="ts">
	import type { Component } from "svelte";

	import { haptic } from "#lib/haptics.js";

	interface Props {
		label: string;
		icon: Component<{ class?: string }>;
		onclick: () => void;
	}

	const { label, icon: Icon, onclick }: Props = $props();
</script>

<button
	type="button"
	aria-label={label}
	onclick={() => {
		haptic("tap");
		onclick();
	}}
	class="from-primary glow fixed right-5 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] z-40 flex size-15 items-center justify-center rounded-2xl bg-linear-to-br to-[oklch(0.62_calc(var(--primary-chroma)*1.1)_calc(var(--hue)+40))] text-white transition-transform duration-200 active:scale-90 md:hidden"
	style="view-transition-name: fab"
>
	<Icon class="size-7" />
</button>
