<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	import { Button } from "#lib/components/ui/button/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const notFound = $derived(page.status === 404);

	setPageTitle(() =>
		page.status === 404 ? "Page not found" : "Something went wrong",
	);
</script>

<div
	class="pt-safe-top pb-safe-bottom flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center"
>
	<p class="text-primary text-7xl font-bold tracking-tight tabular">
		{page.status}
	</p>
	<div>
		<h1 class="text-xl font-semibold">
			{notFound ? "Nothing here" : "Something went wrong"}
		</h1>
		<p class="text-muted-foreground mt-2 text-sm">
			{notFound ? "This page doesn't exist or was moved." : page.error?.message}
		</p>
		{#if page.error?.errorId}
			<p class="text-muted-foreground mt-3 font-mono text-xs">
				Error ID: {page.error.errorId}
			</p>
		{/if}
	</div>
	<Button
		href={resolve("/(protected)")}
		size="lg"
		class="h-11 rounded-full px-6">Back home</Button
	>
</div>
