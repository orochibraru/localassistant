<script lang="ts" module>
	import type { Component } from "svelte";

	export interface MenuAction {
		label: string;
		icon: Component<{ class?: string }>;
		destructive?: boolean;
		onSelect?: () => void;
		form?: {
			action: string;
			fields: Record<string, string>;
			loading: string;
			success: string;
			confirm?: { title: string; description: string; confirmLabel: string };
		};
	}
</script>

<script lang="ts">
	import { enhance } from "$app/forms";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import XIcon from "@lucide/svelte/icons/x";
	import { type Snippet, tick } from "svelte";
	import { MediaQuery } from "svelte/reactivity";

	import { longPress } from "#lib/actions/long-press.js";
	import IconButton from "#lib/components/icon-button.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
	import * as Drawer from "#lib/components/ui/drawer/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { enhanceToast } from "#lib/toast.js";
	import { cn } from "#lib/utils.js";

	interface Props {
		title: string;
		actions: MenuAction[];
		class?: string;
		onOpen?: () => void;
		children: Snippet;
	}

	const {
		title,
		actions,
		class: className,
		onOpen,
		children,
	}: Props = $props();

	const desktop = new MediaQuery("(min-width: 768px)");

	let drawerOpen = $state(false);
	let confirming = $state<MenuAction | undefined>();
	let confirmOpen = $state(false);
	let pending = $state<MenuAction | undefined>();
	let quietForm: HTMLFormElement | undefined = $state();

	async function run(action: MenuAction) {
		drawerOpen = false;
		if (action.onSelect) {
			action.onSelect();
			return;
		}
		if (action.form?.confirm) {
			confirming = action;
			confirmOpen = true;
			return;
		}
		pending = action;
		await tick();
		quietForm?.requestSubmit();
	}
</script>

{#snippet content()}
	{#if onOpen}
		<button
			type="button"
			class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
			onclick={onOpen}
		>
			{@render children()}
		</button>
	{:else}
		{@render children()}
	{/if}
{/snippet}

{#snippet trailing()}
	{#if desktop.current}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<IconButton
						{...props}
						label="More actions"
						icon={EllipsisIcon}
						class="text-muted-foreground"
					/>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="min-w-48">
				{#each actions as action (action.label)}
					<DropdownMenu.Item
						variant={action.destructive ? "destructive" : "default"}
						onSelect={() => run(action)}
					>
						<action.icon />
						{action.label}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{:else}
		<IconButton
			label="More actions"
			icon={EllipsisIcon}
			class="text-muted-foreground"
			onclick={() => (drawerOpen = true)}
		/>
	{/if}
{/snippet}

{#if actions.length === 0}
	<div class={cn("flex items-center gap-3", className)}>
		{@render content()}
	</div>
{:else if desktop.current}
	<ContextMenu.Root>
		<ContextMenu.Trigger class={cn("flex items-center gap-3", className)}>
			{@render content()}
			{@render trailing()}
		</ContextMenu.Trigger>
		<ContextMenu.Content class="min-w-48">
			{#each actions as action (action.label)}
				<ContextMenu.Item
					variant={action.destructive ? "destructive" : "default"}
					onSelect={() => run(action)}
				>
					<action.icon />
					{action.label}
				</ContextMenu.Item>
			{/each}
		</ContextMenu.Content>
	</ContextMenu.Root>
{:else}
	<div
		class={cn(
			"flex items-center gap-3 [-webkit-touch-callout:none] select-none",
			className,
		)}
		use:longPress={() => (drawerOpen = true)}
	>
		{@render content()}
		{@render trailing()}
	</div>
	<Drawer.Root bind:open={drawerOpen}>
		<Drawer.Content>
			<Drawer.Header class="text-left">
				<Drawer.Title class="truncate">{title}</Drawer.Title>
			</Drawer.Header>
			<div class="flex flex-col gap-1 px-3 pb-4">
				{#each actions as action (action.label)}
					<Button
						variant="ghost"
						class={cn(
							"h-12 justify-start gap-3 rounded-xl px-3 text-base",
							action.destructive && "text-destructive",
						)}
						onclick={() => run(action)}
					>
						<action.icon class="size-5" />
						{action.label}
					</Button>
				{/each}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}

{#if pending?.form}
	<form
		bind:this={quietForm}
		method="POST"
		action={pending.form.action}
		class="hidden"
		use:enhance={enhanceToast({
			loading: pending.form.loading,
			success: pending.form.success,
		})}
	>
		{#each Object.entries(pending.form.fields) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
	</form>
{/if}

{#if confirming?.form?.confirm}
	{@const form = confirming.form}
	<ResponsiveSheet
		bind:open={confirmOpen}
		title={form.confirm?.title ?? ""}
		description={form.confirm?.description}
	>
		<form
			method="POST"
			action={form.action}
			class="flex flex-col-reverse gap-2 pb-4 md:flex-row md:justify-end"
			use:enhance={enhanceToast({
				loading: form.loading,
				success: form.success,
				onSuccess: () => {
					confirmOpen = false;
				},
			})}
		>
			{#each Object.entries(form.fields) as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}
			<Button
				variant="outline"
				class="h-11 rounded-xl"
				onclick={() => (confirmOpen = false)}
			>
				<XIcon />
				Cancel
			</Button>
			<Button
				type="submit"
				variant={confirming.destructive ? "destructive" : "default"}
				class="h-11 rounded-xl"
			>
				<confirming.icon />
				{form.confirm?.confirmLabel}
			</Button>
		</form>
	</ResponsiveSheet>
{/if}
