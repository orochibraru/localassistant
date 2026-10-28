<script lang="ts">
	import { cn } from "#lib/utils.js";

	const { class: className }: { class?: string } = $props();
</script>

<svg class={cn("size-8", className)} viewBox="0 0 512 512" aria-hidden="true">
	<rect width="512" height="512" rx="112" class="fill-primary" />
	<path
		d="M120 256 256 140l136 116"
		fill="none"
		class="stroke-primary-foreground"
		stroke-width="44"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<path
		d="M164 228v148h184V228"
		fill="none"
		class="stroke-primary-foreground"
		stroke-width="44"
		stroke-linejoin="round"
	/>
	<rect
		x="226"
		y="290"
		width="60"
		height="86"
		rx="8"
		class="fill-primary-foreground"
		fill-opacity="0.55"
	/>
</svg>
