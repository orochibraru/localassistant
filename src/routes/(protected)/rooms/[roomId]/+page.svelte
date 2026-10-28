<script lang="ts">
	import { resolve } from "$app/paths";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import DeviceGrid from "#lib/components/devices/device-grid.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { LiveRefresh } from "#lib/live-refresh.svelte.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { useSheets } from "#lib/sheets.svelte.js";

	const { data } = $props();

	const sheets = useSheets();

	setPageTitle(
		() => data.room.name,
		() => resolve("/(protected)/house"),
		() =>
			data.isAdmin && data.room.id !== "house"
				? [
						{
							label: "Room settings",
							icon: SettingsIcon,
							onSelect: () => (sheets.room = { id: data.room.id }),
						},
					]
				: [],
	);

	const live = new LiveRefresh();
</script>

{#if data.devices.length === 0}
	<div class="glass mx-auto mt-6 max-w-xl rounded-3xl">
		<EmptyState
			icon={DoorOpenIcon}
			title="Nothing in {data.room.name} yet"
			subtitle={data.isAdmin
				? "Pick this room in a device's Edit sheet."
				: "Ask an admin to move devices here."}
		>
			{#if data.isAdmin}
				<Button
					size="lg"
					class="h-11 rounded-xl px-6"
					href={resolve("/(protected)/devices")}
				>
					<PlugIcon />
					Devices
				</Button>
			{/if}
		</EmptyState>
	</div>
{:else}
	<DeviceGrid devices={data.devices} now={live.now} />
{/if}
