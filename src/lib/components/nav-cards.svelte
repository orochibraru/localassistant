<script lang="ts" module>
	import type { Component } from "svelte";

	export interface SectionTab {
		href: string;
		label: string;
		description: string;
		icon: Component<{ class?: string }>;
	}
</script>

<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	const { tabs }: { tabs: SectionTab[] } = $props();
</script>

<nav aria-label="Sections" class="md:hidden">
	<ul
		class="glass divide-border divide-y overflow-hidden rounded-2xl md:grid md:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] md:gap-4 md:divide-y-0 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:shadow-none md:backdrop-blur-none"
	>
		{#each tabs as tab (tab.href)}
			<li>
				<a
					href={tab.href}
					class="active:bg-muted md:glass md:hover:border-primary/40 flex min-h-18 items-center gap-4 px-4 py-3 transition-colors md:h-full md:rounded-2xl md:p-5"
				>
					<span
						class="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-xl"
					>
						<tab.icon class="size-5" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block font-semibold">{tab.label}</span>
						<span class="text-muted-foreground block text-sm"
							>{tab.description}</span
						>
					</span>
					<ChevronRightIcon class="text-muted-foreground/60 size-5 shrink-0" />
				</a>
			</li>
		{/each}
	</ul>
</nav>
