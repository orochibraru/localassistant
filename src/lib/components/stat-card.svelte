<script lang="ts">
	import type { Component } from "svelte";

	interface Props {
		label: string;
		value: string | number;
		hint?: string;
		href?: string;
		icon: Component<{ class?: string }>;
		tone?: "default" | "positive" | "warning";
	}

	const {
		label,
		value,
		hint,
		href,
		icon: Icon,
		tone = "default",
	}: Props = $props();

	const toneClass = $derived(
		{
			default: "bg-accent text-accent-foreground",
			positive: "bg-positive/15 text-positive",
			warning: "bg-destructive/10 text-destructive",
		}[tone],
	);
</script>

<svelte:element
	this={href ? "a" : "div"}
	{href}
	class="glass flex items-start gap-3 rounded-2xl p-4 transition-colors {href
		? 'hover:border-primary/40 active:bg-muted'
		: ''}"
>
	<div
		class="flex size-10 shrink-0 items-center justify-center rounded-xl {toneClass}"
	>
		<Icon class="size-5" />
	</div>
	<div class="min-w-0">
		<p class="text-muted-foreground text-sm">
			{label}
		</p>
		<p class="mt-0.5 truncate text-xl font-semibold tabular">{value}</p>
		{#if hint}
			<p class="text-muted-foreground mt-0.5 truncate text-xs">{hint}</p>
		{/if}
	</div>
</svelte:element>
