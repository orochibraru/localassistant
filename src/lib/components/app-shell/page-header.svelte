<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import BellIcon from "@lucide/svelte/icons/bell";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import UserRoundIcon from "@lucide/svelte/icons/user-round";

	import IconButton from "#lib/components/icon-button.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { usePageTitle } from "#lib/page-title.svelte.js";

	const { user }: { user: { name: string; email: string } } = $props();

	const title = usePageTitle();
	const unread = $derived(page.data.unreadNotifications ?? 0);

	let signOutForm: HTMLFormElement | undefined = $state();
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
	<span class="relative">
		<IconButton
			label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
			icon={BellIcon}
			href={resolve("/(protected)/notifications")}
			variant="outline"
		/>
		{#if unread > 0}
			<span
				class="bg-primary text-primary-foreground pointer-events-none absolute -top-1 -right-1 min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums"
				aria-hidden="true">{unread > 99 ? "99+" : unread}</span
			>
		{/if}
	</span>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="from-primary flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br to-[oklch(0.6_0.15_calc(var(--hue)+60))] text-sm font-semibold text-white"
			aria-label="Your account, {user.name}"
		>
			{user.name.slice(0, 1).toUpperCase()}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-60">
			<DropdownMenu.Label class="font-normal">
				<span class="block truncate font-medium">{user.name}</span>
				<span class="text-muted-foreground block truncate text-xs"
					>{user.email}</span
				>
			</DropdownMenu.Label>
			<DropdownMenu.Separator />
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href={resolve("/(protected)/account/profile")}>
						<UserRoundIcon />
						Account
					</a>
				{/snippet}
			</DropdownMenu.Item>
			<DropdownMenu.Item
				variant="destructive"
				onSelect={() => signOutForm?.requestSubmit()}
			>
				<LogOutIcon />
				Sign out
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
	<form
		bind:this={signOutForm}
		method="POST"
		action="{resolve('/(protected)/account')}?/signOut"
		use:enhance
		hidden
	></form>
</header>
