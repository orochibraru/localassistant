<script lang="ts">
	import { page } from "$app/state";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";

	import {
		isActive,
		phoneNavigation,
	} from "#lib/components/app-shell/navigation.js";
	import * as Drawer from "#lib/components/ui/drawer/index.js";

	const { isAdmin }: { isAdmin: boolean } = $props();

	let moreOpen = $state(false);

	const navigation = $derived(phoneNavigation(isAdmin));
	const moreActive = $derived(
		navigation.more.some((item) => isActive(page.url.pathname, item.href)),
	);
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
	style="view-transition-name: tab-bar"
	aria-label="Main"
>
	<ul
		class="bg-popover border-border flex min-w-0 flex-1 items-center gap-1 rounded-full border p-1.5 shadow-lg"
	>
		{#each navigation.tabs as item (item.href)}
			{@const active = isActive(page.url.pathname, item.href)}
			<li class="min-w-0 flex-1">
				<a
					href={item.href}
					aria-current={active ? "page" : undefined}
					class="text-muted-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground aria-[current=page]:glow flex h-14 flex-col items-center justify-center gap-1 rounded-full px-1 text-[0.6875rem] font-medium transition-all active:scale-95"
				>
					<item.icon class="size-5 shrink-0" />
					<span class="max-w-full truncate">{item.label}</span>
				</a>
			</li>
		{/each}
	</ul>
	{#if navigation.more.length > 0}
		<button
			type="button"
			class="bg-popover border-border text-muted-foreground flex size-17 shrink-0 flex-col items-center justify-center gap-1 rounded-full border text-[0.6875rem] font-medium shadow-lg transition-all active:scale-95 {moreActive
				? 'bg-primary text-primary-foreground glow border-transparent'
				: ''}"
			aria-haspopup="dialog"
			aria-expanded={moreOpen}
			onclick={() => (moreOpen = true)}
		>
			<EllipsisIcon class="size-5" />
			More
		</button>
	{/if}
</nav>

<Drawer.Root bind:open={moreOpen}>
	<Drawer.Content>
		<Drawer.Header class="text-left">
			<Drawer.Title>More</Drawer.Title>
		</Drawer.Header>
		<ul class="flex flex-col gap-1 px-3 pb-6">
			{#each navigation.more as item (item.href)}
				{@const active = isActive(page.url.pathname, item.href)}
				<li>
					<a
						href={item.href}
						aria-current={active ? "page" : undefined}
						class="aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground flex h-14 items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors active:scale-[0.99]"
						onclick={() => (moreOpen = false)}
					>
						<item.icon class="text-muted-foreground size-5" />
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
	</Drawer.Content>
</Drawer.Root>
