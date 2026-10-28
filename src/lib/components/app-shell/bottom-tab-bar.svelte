<script lang="ts">
	import { page } from "$app/state";

	import {
		isActive,
		navigationItems,
	} from "#lib/components/app-shell/navigation.js";

	const { isAdmin }: { isAdmin: boolean } = $props();

	const items = $derived(navigationItems(isAdmin));
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
	style="view-transition-name: tab-bar"
	aria-label="Main"
>
	<ul
		class="bg-popover border-border mx-auto flex max-w-sm items-center gap-1 rounded-full border p-1.5 shadow-lg"
	>
		{#each items as item (item.href)}
			{@const active = isActive(page.url.pathname, item.href)}
			<li class="flex-1">
				<a
					href={item.href}
					aria-current={active ? "page" : undefined}
					class="text-muted-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground aria-[current=page]:glow flex h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] font-medium transition-all active:scale-95"
				>
					<item.icon class="size-5" />
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
