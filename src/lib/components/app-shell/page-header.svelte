<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";

	import IconButton from "#lib/components/icon-button.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { usePageTitle } from "#lib/page-title.svelte.js";

	const title = usePageTitle();
</script>

<header class="mb-6 hidden min-h-10 items-center gap-3 md:flex">
	{#if title.backHref && title.backHref !== resolve("/(protected)")}
		<IconButton
			label="Back"
			icon={ChevronLeftIcon}
			href={title.backHref}
			variant="outline"
		/>
	{/if}
	<h1
		class="font-display min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight"
	>
		{title.current}
	</h1>
	{#each title.actions as action (action.label)}
		<Button
			href={action.href}
			onclick={action.onSelect}
			variant={action.primary ? "default" : "outline"}
			class="h-10 rounded-xl px-4 {action.primary ? 'glow' : ''}"
		>
			<action.icon />
			{action.label}
		</Button>
	{/each}
</header>
