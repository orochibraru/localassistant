<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import type { Component } from "svelte";

	import {
		isActive,
		navigationItems,
	} from "#lib/components/app-shell/navigation.js";
	import BrandMark from "#lib/components/brand-mark.svelte";
	import { kindIcon } from "#lib/components/devices/device-kinds.js";
	import HomeSwitcher from "#lib/components/house/home-switcher.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { type HouseFloor, houseGroups, type HouseRoom } from "#lib/house.js";
	import { roomIcon } from "#lib/room-icons.js";
	import { useSheets } from "#lib/sheets.svelte.js";

	interface Props {
		isAdmin: boolean;
		rooms: HouseRoom[];
		floors: HouseFloor[];
		devices: {
			id: string;
			name: string;
			kind: string;
			roomId: string | null;
		}[];
		home: { id: string; name: string };
		homes: { id: string; name: string }[];
	}

	const { isAdmin, rooms, floors, devices, home, homes }: Props = $props();

	const sheets = useSheets();

	const homeHref = resolve("/(protected)");
	const sectionHrefs = new Set<string>([
		resolve("/(protected)/house"),
		resolve("/(protected)/devices"),
	]);
	const items = $derived(
		navigationItems(isAdmin).filter((item) => !sectionHrefs.has(item.href)),
	);
	const groups = $derived(houseGroups(floors, rooms));
	const showGroupNames = $derived(
		groups.length > 1 || groups.some((group) => group.id === "outside"),
	);
	const sortedDevices = $derived(
		devices.toSorted((first, second) => first.name.localeCompare(second.name)),
	);

	const linkClass =
		"text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors";

	function roomHref(roomId: string): string {
		return resolve("/(protected)/rooms/[roomId]", { roomId });
	}
</script>

<aside
	class="bg-chrome fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r backdrop-blur-2xl backdrop-saturate-150 md:flex"
	style="view-transition-name: app-sidebar"
	aria-label="Sidebar"
>
	<a
		href={homeHref}
		class="flex h-16 shrink-0 items-center gap-2.5 px-5"
		aria-label="LocalAssistant home"
	>
		<BrandMark class="size-8" />
		<span class="font-display text-lg font-semibold">LocalAssistant</span>
	</a>

	{#if homes.length > 0}
		<div class="px-3 pb-3">
			<HomeSwitcher {home} {homes} />
		</div>
	{/if}

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

	<div
		class="no-scrollbar mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-6"
	>
		<section aria-label="House">
			<div class="flex items-center justify-between px-3 pb-1.5">
				<a
					href={resolve("/(protected)/house")}
					class="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
					>House</a
				>
				{#if isAdmin}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<IconButton
									{...props}
									label="Add to the house"
									icon={PlusIcon}
									class="text-muted-foreground -mr-1.5 size-7 md:size-7"
								/>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start" class="w-48">
							<DropdownMenu.Item onSelect={() => (sheets.room = { id: null })}>
								<DoorOpenIcon />Add a room
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (sheets.floor = { id: null })}>
								<LayersIcon />Add a floor
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
			</div>
			<ul class="flex flex-col gap-0.5">
				<li>
					<a
						href={roomHref("house")}
						aria-current={page.url.pathname === roomHref("house")
							? "page"
							: undefined}
						class={linkClass}
					>
						<HouseIcon class="size-4 shrink-0" />
						<span class="truncate">Whole house</span>
					</a>
				</li>
			</ul>
			{#each groups as group (group.id)}
				{#if showGroupNames}
					<h3
						class="text-muted-foreground/70 mt-3 px-3 pb-1 text-[0.6875rem] font-medium tracking-wide uppercase"
					>
						{group.name}
					</h3>
				{/if}
				<ul class="flex flex-col gap-0.5">
					{#each group.rooms as room (room.id)}
						{@const Icon = roomIcon(room.icon)}
						<li>
							<a
								href={roomHref(room.id)}
								aria-current={page.url.pathname === roomHref(room.id)
									? "page"
									: undefined}
								class={linkClass}
							>
								<Icon class="size-4 shrink-0" />
								<span class="truncate">{room.name}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/each}
		</section>

		<section aria-label="Devices">
			<div class="flex items-center justify-between px-3 pb-1.5">
				{#if isAdmin}
					<a
						href={resolve("/(protected)/devices")}
						class="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
						>Devices</a
					>
					<IconButton
						label="Add a device"
						icon={PlusIcon}
						class="text-muted-foreground -mr-1.5 size-7 md:size-7"
						onclick={() => (sheets.pickDevice = true)}
					/>
				{:else}
					<h2 class="text-muted-foreground text-xs font-medium">Devices</h2>
				{/if}
			</div>
			<ul class="flex flex-col gap-0.5">
				{#each sortedDevices as device (device.id)}
					{@const Icon = kindIcon(page.data.kinds, device.kind)}
					<li>
						{#if isAdmin}
							<button
								type="button"
								class={linkClass}
								onclick={() => (sheets.editDeviceId = device.id)}
							>
								<Icon class="size-4 shrink-0" />
								<span class="truncate">{device.name}</span>
							</button>
						{:else}
							<a href={roomHref(device.roomId ?? "house")} class={linkClass}>
								<Icon class="size-4 shrink-0" />
								<span class="truncate">{device.name}</span>
							</a>
						{/if}
					</li>
				{:else}
					<li class="text-muted-foreground px-3 py-2 text-sm">
						No devices yet.
					</li>
				{/each}
			</ul>
		</section>
	</div>
</aside>
