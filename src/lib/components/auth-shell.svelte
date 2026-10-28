<script lang="ts">
	import type { Snippet } from "svelte";

	import BrandMark from "#lib/components/brand-mark.svelte";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	interface Props {
		heading: string;
		subheading?: string;
		children: Snippet;
		footer?: Snippet;
	}

	const { heading, subheading, children, footer }: Props = $props();

	setPageTitle(() => heading);
</script>

<div class="pt-safe-top flex min-h-[85dvh] flex-col justify-center px-6 py-12">
	<div class="mx-auto w-full max-w-sm">
		<BrandMark class="mb-8 size-12" />
		<h1 class="text-3xl font-bold tracking-tight">{heading}</h1>
		{#if subheading}
			<p class="text-muted-foreground mt-2">{subheading}</p>
		{/if}
		<div class="mt-8">
			{@render children()}
		</div>
		{#if footer}
			<p class="text-muted-foreground mt-8 text-center text-sm">
				{@render footer()}
			</p>
		{/if}
	</div>
</div>
