<script lang="ts" module>
	import type { Component } from "svelte";

	export interface Tab {
		href: string;
		label: string;
		icon?: Component<{ class?: string }>;
	}
</script>

<script lang="ts">
	import { page } from "$app/state";

	const { tabs }: { tabs: Tab[] } = $props();

	function scrollIntoViewWhenActive(node: HTMLElement, active: boolean) {
		if (active) {
			node.scrollIntoView({ block: "nearest", inline: "center" });
		}
	}
</script>

<nav class="no-scrollbar flex overflow-x-auto py-1" aria-label="Sections">
	<div class="glass flex w-full gap-1 rounded-full p-1 md:w-auto md:shrink-0">
		{#each tabs as tab (tab.href)}
			{@const active = page.url.pathname === tab.href}
			<a
				href={tab.href}
				aria-current={active ? "page" : undefined}
				use:scrollIntoViewWhenActive={active}
				class="text-muted-foreground hover:bg-accent/70 hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground aria-[current=page]:glow focus-visible:ring-ring/50 flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-2 md:flex-none md:shrink-0 md:px-4 text-sm font-medium transition-[color,background-color,box-shadow] outline-none focus-visible:ring-3"
			>
				{#if tab.icon}<tab.icon class="hidden size-4 sm:block" />{/if}
				{tab.label}
			</a>
		{/each}
	</div>
</nav>
