<script lang="ts">
	import { page } from "$app/state";

	import AppFooter from "#lib/components/app-footer.svelte";
	import AppBar from "#lib/components/app-shell/app-bar.svelte";
	import BottomTabBar from "#lib/components/app-shell/bottom-tab-bar.svelte";
	import PageHeader from "#lib/components/app-shell/page-header.svelte";
	import Sidebar from "#lib/components/app-shell/sidebar.svelte";
	import AppReporter from "#lib/components/devices/app-reporter.svelte";
	import DeviceSheets from "#lib/components/devices/device-sheets.svelte";
	import FloorSheet from "#lib/components/house/floor-sheet.svelte";
	import RoomSheet from "#lib/components/house/room-sheet.svelte";
	import InstallPrompt from "#lib/components/install-prompt.svelte";
	import { provideSheets } from "#lib/sheets.svelte.js";

	const { children, data } = $props();

	provideSheets();

	const panel = $derived(page.route.id === "/(protected)/panel");
</script>

{#if panel}
	{@render children()}
	<AppReporter />
{:else}
	<div class="flex min-h-dvh flex-col md:pl-64">
		<main
			class="min-h-dvh flex-1 pt-[calc(env(safe-area-inset-top)+4.25rem)] pb-10 md:pt-8"
		>
			<div class="px-[max(1rem,env(safe-area-inset-left))] md:px-8 xl:px-10">
				<PageHeader user={data.user} />
				{@render children()}
			</div>
		</main>
		<AppFooter version={data.version} class="px-4 pb-32 md:pb-8" />
	</div>
	<AppBar />
	<Sidebar
		isAdmin={data.isAdmin}
		rooms={data.rooms}
		floors={data.floors}
		devices={data.setup}
		home={data.home}
		homes={data.homes}
	/>
	<BottomTabBar isAdmin={data.isAdmin} />
	<InstallPrompt />
	<AppReporter />
	{#if data.isAdmin}
		<DeviceSheets
			devices={data.setup}
			rooms={data.rooms}
			floors={data.floors}
			setups={data.pluginSetups}
			kinds={data.kinds}
			brokerUrl={data.brokerUrl}
			people={data.people}
		/>
		<RoomSheet rooms={data.rooms} floors={data.floors} />
		<FloorSheet floors={data.floors} />
	{/if}
{/if}
