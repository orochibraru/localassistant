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
		footer?: Snippet;
	}

	let {
		open = $bindable(),
		title,
		description,
		wide = false,
		children,
		footer,
	}: Props = $props();

	const desktop = new MediaQuery("(min-width: 768px)");

	let atTop = $state(true);

	$effect(() => {
		if (open) {
			atTop = true;
		}
	});
</script>

{#if desktop.current}
	<Dialog.Root bind:open>
		<Dialog.Content
			class="max-h-[calc(100dvh-4rem)] {footer
				? 'grid-rows-[auto_minmax(0,1fr)_auto]'
				: 'grid-rows-[auto_minmax(0,1fr)]'} {wide
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
			{#if footer}
				<div class="flex flex-col gap-2">{@render footer()}</div>
			{/if}
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
			<div
				class="min-h-0 flex-1 overflow-y-auto px-5"
				style:touch-action={atTop ? "pan-down" : "pan-y"}
				onscroll={(event) => (atTop = event.currentTarget.scrollTop <= 0)}
			>
				{@render children()}
			</div>
			{#if footer}
				<div class="flex shrink-0 flex-col gap-2 border-t px-5 pt-3 pb-2">
					{@render footer()}
				</div>
			{/if}
		</Drawer.Content>
	</Drawer.Root>
{/if}
