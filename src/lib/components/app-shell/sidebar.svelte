<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import UserRoundIcon from "@lucide/svelte/icons/user-round";

	import {
		isActive,
		navigationItems,
	} from "#lib/components/app-shell/navigation.js";
	import BrandMark from "#lib/components/brand-mark.svelte";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";

	interface Props {
		isAdmin: boolean;
		user: { name: string; email: string };
	}

	const { isAdmin, user }: Props = $props();

	const homeHref = resolve("/(protected)");
	const accountHref = resolve("/(protected)/account");
	const items = $derived(
		navigationItems(isAdmin).filter((item) => item.href !== accountHref),
	);
	let signOutForm: HTMLFormElement | undefined = $state();
</script>

<aside
	class="bg-chrome fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r backdrop-blur-2xl backdrop-saturate-150 md:flex"
	style="view-transition-name: app-sidebar"
	aria-label="Sidebar"
>
	<a
		href={resolve("/(protected)")}
		class="flex h-16 shrink-0 items-center gap-2.5 px-5"
		aria-label="LocalAssistant home"
	>
		<BrandMark class="size-8" />
		<span class="font-display text-lg font-semibold">LocalAssistant</span>
	</a>

	<nav aria-label="Main" class="px-3">
		<ul class="flex flex-col gap-0.5">
			{#each items as item (item.href)}
				<li>
					<a
						href={item.href}
						aria-current={(
							item.href === homeHref
								? page.url.pathname === homeHref
								: isActive(page.url.pathname, item.href)
						)
							? "page"
							: undefined}
						class="text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors"
					>
						<item.icon class="size-4" />
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="flex-1"></div>

	<div class="border-t p-3">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="hover:bg-muted aria-expanded:bg-muted flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors"
			>
				<span
					class="from-primary flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br to-[oklch(0.6_0.15_calc(var(--hue)+60))] text-sm font-semibold text-white"
					aria-hidden="true"
				>
					{user.name.slice(0, 1).toUpperCase()}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm font-medium">{user.name}</span>
					<span class="text-muted-foreground block truncate text-xs"
						>{user.email}</span
					>
				</span>
				<ChevronsUpDownIcon class="text-muted-foreground size-4 shrink-0" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content side="top" align="start" class="w-56">
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href={resolve("/(protected)/account/profile")}>
							<UserRoundIcon />
							Account
						</a>
					{/snippet}
				</DropdownMenu.Item>
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href={resolve("/(protected)/account/appearance")}>
							<PaletteIcon />
							Appearance
						</a>
					{/snippet}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
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
			action="{accountHref}?/signOut"
			use:enhance
			hidden
		></form>
	</div>
</aside>
