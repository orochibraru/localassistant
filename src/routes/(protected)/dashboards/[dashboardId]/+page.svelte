<script lang="ts">
	import { resolve } from "$app/paths";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import PencilIcon from "@lucide/svelte/icons/pencil";

	import SceneButton from "#lib/components/automations/scene-button.svelte";
	import DashboardSheet from "#lib/components/dashboards/dashboard-sheet.svelte";
	import DeviceGrid from "#lib/components/devices/device-grid.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import GraphTile from "#lib/components/history/graph-tile.svelte";
	import PeopleStrip from "#lib/components/house/people-strip.svelte";
	import WeatherCard from "#lib/components/house/weather-card.svelte";
	import { LiveRefresh } from "#lib/live-refresh.svelte.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	let sheetOpen = $state(false);
	const live = new LiveRefresh();

	setPageTitle(
		() => data.dashboard.name,
		resolve("/(protected)/dashboards"),
		() => [
			{
				label: "Edit",
				icon: PencilIcon,
				onSelect: () => (sheetOpen = true),
			},
		],
	);

	const devicesById = $derived(
		new Map(data.devices.map((device) => [device.id, device])),
	);
	const scenesById = $derived(
		new Map(data.scenes.map((scene) => [scene.id, scene])),
	);
</script>

<div class="flex flex-col gap-6">
	{#each data.dashboard.sections as section, index (index)}
		{#if section.type === "heading"}
			<h2 class="text-muted-foreground text-sm font-medium">{section.text}</h2>
		{:else if section.type === "devices"}
			{@const shown = section.deviceIds.flatMap((id) => {
				const device = devicesById.get(id);
				return device ? [device] : [];
			})}
			{#if shown.length > 0}
				<DeviceGrid devices={shown} now={live.now} order={section.deviceIds} />
			{/if}
		{:else if section.type === "scenes"}
			<div class="flex flex-wrap gap-2">
				{#each section.sceneIds as sceneId (sceneId)}
					{@const scene = scenesById.get(sceneId)}
					{#if scene}
						<SceneButton {scene} label={scene.name} />
					{/if}
				{/each}
			</div>
		{:else if section.type === "weather"}
			<WeatherCard home={data.home} isAdmin={data.isAdmin} />
		{:else if section.type === "people"}
			<PeopleStrip people={data.presence} now={live.now} />
		{:else if section.type === "graph"}
			{@const device = devicesById.get(section.deviceId)}
			{#if device}
				<GraphTile
					deviceId={device.id}
					name={device.name}
					range={section.range}
				/>
			{/if}
		{/if}
	{:else}
		<div class="glass rounded-2xl">
			<EmptyState
				icon={LayoutDashboardIcon}
				title="Nothing on it yet"
				subtitle="Edit it to add devices, scenes and graphs."
			/>
		</div>
	{/each}
</div>

<DashboardSheet
	bind:open={sheetOpen}
	editing={data.dashboard}
	devices={data.setup}
	scenes={data.scenes}
/>
