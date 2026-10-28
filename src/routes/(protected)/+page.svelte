<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import HouseIcon from "@lucide/svelte/icons/house";
	import PlugIcon from "@lucide/svelte/icons/plug";

	import DeviceGrid from "#lib/components/devices/device-grid.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { houseGroups, roomLabels } from "#lib/house.js";
	import { LiveRefresh } from "#lib/live-refresh.svelte.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	setPageTitle("Home");

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
				<DeviceGrid devices={section.devices} now={live.now} />
			</section>
		{/each}
	</div>
{/if}
