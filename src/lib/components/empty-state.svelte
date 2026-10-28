<script lang="ts">
	import type { Component, Snippet } from "svelte";

	interface Props {
		icon: Component<{ class?: string }>;
		title: string;
		subtitle?: string;
		children?: Snippet;
	}

	const { icon: Icon, title, subtitle, children }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center px-6 py-16 text-center">
	<div
		class="bg-accent text-accent-foreground mb-5 flex size-16 items-center justify-center rounded-2xl"
	>
		<Icon class="size-7" />
	</div>
	<p class="text-lg font-semibold tracking-tight">{title}</p>
	{#if subtitle}
		<p class="text-muted-foreground mt-1.5 max-w-xs text-sm text-pretty">
			{subtitle}
		</p>
	{/if}
	{#if children}
		<div class="mt-6">
			{@render children()}
		</div>
	{/if}
</div>
