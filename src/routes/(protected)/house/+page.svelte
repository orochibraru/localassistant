<script lang="ts">
	import { resolve } from "$app/paths";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import EmptyState from "#lib/components/empty-state.svelte";
	import Fab from "#lib/components/fab.svelte";
	import HomeSwitcher from "#lib/components/house/home-switcher.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { houseGroups, outsidePlace } from "#lib/house.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { roomIcon } from "#lib/room-icons.js";
	import { useSheets } from "#lib/sheets.svelte.js";

	const { data } = $props();

	const sheets = useSheets();

	setPageTitle("House", undefined, () =>
		data.isAdmin
			? [
					{
						label: "Add a floor",
						icon: LayersIcon,
						onSelect: () => (sheets.floor = { id: null }),
					},
					{
						label: "Add a room",
						icon: PlusIcon,
						onSelect: () => (sheets.room = { id: null }),
						primary: true,
					},
				]
			: [],
	);

	const groups = $derived(houseGroups(data.floors, data.rooms, true));
	const floorIds = $derived(new Set(data.floors.map((floor) => floor.id)));
	const wholeHouseDevices = $derived(
		data.setup.filter((device) => device.roomId === null).length,
	);

	function devicesLabel(count: number): string {
		return count === 1 ? "1 device" : `${count} devices`;
	}
</script>

{#snippet roomCard(
	href: string,
	name: string,
	icon: string | null,
	count: number,
)}
	{@const Icon = icon ? roomIcon(icon) : HouseIcon}
	<a
		{href}
		class="glass flex min-h-16 items-center gap-3 rounded-2xl p-3 transition-transform duration-200 active:scale-[0.98]"
	>
		<span
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			aria-hidden="true"
		>
			<Icon class="size-5" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block truncate font-medium">{name}</span>
			<span class="text-muted-foreground block text-sm"
				>{devicesLabel(count)}</span
			>
		</span>
	</a>
{/snippet}

<div class="flex flex-col gap-8">
	{#if data.homes.length > 0}
		<HomeSwitcher home={data.home} homes={data.homes} class="md:hidden" />
	{/if}
	<ul class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
		<li>
			{@render roomCard(
				resolve("/(protected)/rooms/[roomId]", { roomId: "house" }),
				"Whole house",
				null,
				wholeHouseDevices,
			)}
		</li>
	</ul>

	{#if data.isAdmin && data.floors.length === 0 && data.rooms.length > 0}
		<section
			class="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center md:p-5"
		>
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
				aria-hidden="true"
			>
				<LayersIcon class="size-5" />
			</span>
			<p class="text-muted-foreground flex-1 text-sm">
				Add your first floor and every room moves onto it. Add the others from
				the basement up, then move rooms from their settings.
			</p>
			<Button
				class="h-11 rounded-xl px-5"
				onclick={() => (sheets.floor = { id: null })}
				><LayersIcon />Add a floor</Button
			>
		</section>
	{/if}

	{#each groups as group (group.id)}
		<section aria-labelledby="group-{group.id}">
			<div class="mb-3 flex items-center gap-2">
				<h2
					id="group-{group.id}"
					class="text-muted-foreground text-sm font-medium"
				>
					{group.name}
				</h2>
				{#if data.isAdmin && floorIds.has(group.id)}
					<IconButton
						label="{group.name} settings"
						icon={SettingsIcon}
						class="text-muted-foreground size-9 md:size-8"
						onclick={() => (sheets.floor = { id: group.id })}
					/>
				{/if}
				{#if data.isAdmin}
					<IconButton
						label="Add a room to {group.name}"
						icon={PlusIcon}
						class="text-muted-foreground size-9 md:size-8"
						onclick={() =>
							(sheets.room = {
								id: null,
								place: group.id === outsidePlace ? outsidePlace : group.id,
							})}
					/>
				{/if}
			</div>
			{#if group.rooms.length > 0}
				<ul
					class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]"
				>
					{#each group.rooms as room (room.id)}
						<li>
							{@render roomCard(
								resolve("/(protected)/rooms/[roomId]", { roomId: room.id }),
								room.name,
								room.icon,
								data.deviceCounts[room.id] ?? 0,
							)}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-muted-foreground text-sm">No rooms on this floor yet.</p>
			{/if}
		</section>
	{/each}

	{#if data.rooms.length === 0 && data.floors.length === 0}
		<div class="glass mx-auto max-w-xl rounded-3xl">
			<EmptyState
				icon={LayersIcon}
				title="Lay out your house"
				subtitle="Add floors from the basement up, then rooms on each, and outside ones like the garage or the terrace."
			>
				{#if data.isAdmin}
					<Button
						size="lg"
						class="h-11 rounded-xl px-6"
						onclick={() => (sheets.floor = { id: null })}
					>
						<LayersIcon />
						Add a floor
					</Button>
				{/if}
			</EmptyState>
		</div>
	{/if}
</div>

{#if data.isAdmin}
	<Fab
		label="Add a room"
		icon={PlusIcon}
		onclick={() => (sheets.room = { id: null })}
	/>
{/if}
