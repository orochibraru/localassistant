<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import HouseIcon from "@lucide/svelte/icons/house";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import { onMount } from "svelte";

	import ClimateCard from "#lib/components/devices/climate-card.svelte";
	import CoverCard from "#lib/components/devices/cover-card.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	const refreshMs = 30_000;

	let now = $state(Date.now());

	setPageTitle("Home");

	const covers = $derived(
		data.devices.flatMap((device) =>
			device.state?.type === "cover" || device.kind === "tuya-cover"
				? [
						{
							...device,
							state: device.state?.type === "cover" ? device.state : null,
						},
					]
				: [],
		),
	);
	const climates = $derived(
		data.devices.flatMap((device) =>
			device.kind === "tuya-cover"
				? []
				: [
						{
							...device,
							state: device.state?.type === "climate" ? device.state : null,
						},
					],
		),
	);

	onMount(() => {
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") {
				now = Date.now();
				void invalidateAll();
			}
		}, refreshMs);
		return () => clearInterval(timer);
	});
</script>

{#if data.devices.length === 0}
	<div class="glass mx-auto mt-6 max-w-xl rounded-3xl">
		<EmptyState
			icon={HouseIcon}
			title="No devices yet"
			subtitle={data.isAdmin
				? "Connect your MELCloud account and add your Tuya blinds."
				: "Ask an admin to add the blinds and heat pumps."}
		>
			{#if data.isAdmin}
				<Button
					size="lg"
					class="glow h-11 rounded-xl px-6"
					href={resolve("/(protected)/admin/devices")}
				>
					<PlugIcon />
					Add devices
				</Button>
			{/if}
		</EmptyState>
	</div>
{:else}
	<div class="flex flex-col gap-8">
		{#if climates.length > 0}
			<section aria-labelledby="climate-heading">
				<h2
					id="climate-heading"
					class="text-muted-foreground mb-3 text-sm font-medium"
				>
					Heating
				</h2>
				<ul
					class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] md:gap-4"
				>
					{#each climates as device (device.id)}
						<li>
							<ClimateCard
								id={device.id}
								name={device.name}
								reading={device.state}
								error={device.stateError}
								readAt={device.stateAt}
								{now}
							/>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if covers.length > 0}
			<section aria-labelledby="covers-heading">
				<h2
					id="covers-heading"
					class="text-muted-foreground mb-3 text-sm font-medium"
				>
					Blinds
				</h2>
				<ul
					class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] md:gap-4"
				>
					{#each covers as device (device.id)}
						<li>
							<CoverCard
								id={device.id}
								name={device.name}
								reading={device.state}
								error={device.stateError}
								readAt={device.stateAt}
								{now}
							/>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
{/if}
