<script lang="ts">
	import { type Inline, parseMarkdown } from "#lib/markdown.js";

	const { text }: { text: string } = $props();

	const blocks = $derived(parseMarkdown(text));
</script>

{#snippet inlines(children: Inline[])}
	{#each children as child, index (index)}
		{#if child.type === "text"}{child.text}{:else if child.type === "strong"}<strong
				class="font-semibold">{@render inlines(child.children)}</strong
			>{:else if child.type === "emphasis"}<em
				>{@render inlines(child.children)}</em
			>{:else if child.type === "code"}<code
				class="bg-muted rounded px-1 py-0.5 font-mono text-[0.8125rem]"
				>{child.text}</code
			>{:else}<a
				href={child.href}
				target="_blank"
				rel="noopener noreferrer"
				class="text-primary underline underline-offset-2"
				>{@render inlines(child.children)}</a
			>{/if}
	{/each}
{/snippet}

<div class="flex flex-col gap-2">
	{#each blocks as block, index (index)}
		{#if block.type === "paragraph"}
			<p>{@render inlines(block.children)}</p>
		{:else if block.type === "heading"}
			<p class="font-semibold">{@render inlines(block.children)}</p>
		{:else if block.type === "list"}
			<svelte:element
				this={block.ordered ? "ol" : "ul"}
				class="flex flex-col gap-1 pl-5 {block.ordered
					? 'list-decimal'
					: 'list-disc'}"
			>
				{#each block.items as item, itemIndex (itemIndex)}
					<li>{@render inlines(item)}</li>
				{/each}
			</svelte:element>
		{:else}
			<pre
				class="bg-muted overflow-x-auto rounded-xl p-3 font-mono text-[0.8125rem]">{block.text}</pre>
		{/if}
	{/each}
</div>
