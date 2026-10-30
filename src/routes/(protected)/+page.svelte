<script lang="ts">
	import { goto, invalidateAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import CircleArrowUpIcon from "@lucide/svelte/icons/circle-arrow-up";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import XIcon from "@lucide/svelte/icons/x";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import DeviceGrid from "#lib/components/devices/device-grid.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import Fab from "#lib/components/fab.svelte";
	import PeopleStrip from "#lib/components/house/people-strip.svelte";
	import WeatherCard from "#lib/components/house/weather-card.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { refill } from "#lib/devices.js";
	import { houseGroups, roomLabels } from "#lib/house.js";
	import { LiveRefresh } from "#lib/live-refresh.svelte.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { panelMode } from "#lib/panel-mode.js";
	import { sortCards } from "#lib/plugins.js";
	import { arrangeCards } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	const { data } = $props();

	let arranging = $state(false);
	let draft = $state<string[]>([]);

	setPageTitle("Home", undefined, () =>
		data.devices.length === 0
			? []
			: arranging
				? [
						{
							label: "Done",
							icon: CheckIcon,
							onSelect: handleArrange,
							primary: true,
						},
						{
							label: "Cancel",
							icon: XIcon,
							onSelect: () => (arranging = false),
						},
					]
				: [
						{
							label: "Arrange cards",
							icon: LayoutGridIcon,
							onSelect: startArranging,
						},
					],
	);

	function startArranging() {
		draft = sortCards(data.devices, data.cardLayout.order, data.kinds).map(
			(device) => device.id,
		);
		arranging = true;
	}

	async function arrangeCallback() {
		await arrangeCards({ deviceIds: draft });
		await invalidateAll();
		arranging = false;
	}

	function handleArrange() {
		toast.promise(arrangeCallback(), {
			loading: "Saving the layout",
			success: "Layout saved.",
			error: (failure) => toastError(failure),
		});
	}

	onMount(() => {
		if (panelMode()) {
			void goto(resolve("/(protected)/panel"), { replaceState: true });
		}
	});

	const live = new LiveRefresh();

	const labels = $derived(roomLabels(data.rooms, data.floors));
	const sections = $derived(
		[
			{ id: "house", name: "Whole house" },
			...houseGroups(data.floors, data.rooms)
				.flatMap((group) => group.rooms)
				.map((room) => ({
					id: room.id,
					name: labels.get(room.id) ?? room.name,
				})),
		].flatMap((room) => {
			const devices = data.devices.filter(
				(device) => (device.roomId ?? "house") === room.id,
			);
			return devices.length > 0 ? [{ ...room, devices }] : [];
		}),
	);
</script>

<div class="mb-8 flex flex-col gap-4">
	{#if data.update}
		<a
			href={resolve("/(protected)/admin/overview")}
			class="glass hover:bg-accent/40 flex min-h-11 items-center gap-3 rounded-2xl px-4 py-2 text-sm transition-colors"
		>
			<CircleArrowUpIcon class="text-primary size-5 shrink-0" />
			<span class="min-w-0 flex-1"
				>LocalAssistant {data.update.version} is out.</span
			>
			<ChevronRightIcon class="text-muted-foreground size-4" />
		</a>
	{/if}
	<WeatherCard home={data.home} isAdmin={data.isAdmin} />
	<PeopleStrip people={data.presence} now={live.now} />
	{#if data.dashboards.length > 0}
		<nav aria-label="Your dashboards" class="flex flex-wrap gap-2">
			{#each data.dashboards as dashboard (dashboard.id)}
				<Button
					variant="secondary"
					class="h-11 rounded-full px-4"
					href={resolve("/(protected)/dashboards/[dashboardId]", {
						dashboardId: dashboard.id,
					})}><LayoutDashboardIcon />{dashboard.name}</Button
				>
			{/each}
		</nav>
	{/if}
</div>

{#if data.devices.length === 0}
	<div class="glass mx-auto mt-6 max-w-xl rounded-3xl">
		<EmptyState
			icon={HouseIcon}
			title="No devices yet"
			subtitle={data.isAdmin
				? "Connect your MELCloud account, add your blinds and your printer."
				: "Ask an admin to add the devices."}
		>
			{#if data.isAdmin}
				<Button
					size="lg"
					class="glow h-11 rounded-xl px-6"
					href={resolve("/(protected)/devices")}
				>
					<PlugIcon />
					Add devices
				</Button>
			{/if}
		</EmptyState>
	</div>
{:else}
	<div class="flex flex-col gap-8">
		{#each sections as section (section.id)}
			<section aria-labelledby="room-{section.id}">
				<h2 id="room-{section.id}" class="mb-3">
					<a
						href={resolve("/(protected)/rooms/[roomId]", {
							roomId: section.id,
						})}
						class="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 text-sm font-medium transition-colors"
					>
						{section.name}
						<ChevronRightIcon class="size-4" />
					</a>
				</h2>
				<DeviceGrid
					devices={section.devices}
					now={live.now}
					order={arranging ? draft : undefined}
					{arranging}
					onArrange={(ids) => (draft = refill(draft, ids))}
				/>
			</section>
		{/each}
	</div>
{/if}

{#if arranging}
	<Fab label="Done" icon={CheckIcon} onclick={handleArrange} />
{/if}
