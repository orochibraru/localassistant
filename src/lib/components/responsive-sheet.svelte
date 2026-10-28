<script lang="ts">
	import type { Snippet } from "svelte";
	import { MediaQuery } from "svelte/reactivity";

	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import * as Drawer from "#lib/components/ui/drawer/index.js";

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		wide?: boolean;
		children: Snippet;
	}

	let {
		open = $bindable(),
		title,
		description,
		wide = false,
		children,
	}: Props = $props();

	const desktop = new MediaQuery("(min-width: 768px)");
</script>

{#if desktop.current}
	<Dialog.Root bind:open>
		<Dialog.Content
			class="max-h-[calc(100dvh-4rem)] grid-rows-[auto_minmax(0,1fr)] {wide
				? 'sm:max-w-xl'
				: 'sm:max-w-md'}"
		>
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				{#if description}
					<Dialog.Description>{description}</Dialog.Description>
				{/if}
			</Dialog.Header>
			<div class="-mx-6 grid min-h-0 gap-6 overflow-y-auto px-6">
				{@render children()}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Content>
			<Drawer.Header class="px-5 text-left">
				<Drawer.Title>{title}</Drawer.Title>
				{#if description}
					<Drawer.Description>{description}</Drawer.Description>
				{/if}
			</Drawer.Header>
			<div class="min-h-0 overflow-y-auto px-5">
				{@render children()}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
