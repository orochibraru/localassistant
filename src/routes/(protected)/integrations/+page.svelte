<script lang="ts">
	import { enhance } from "$app/forms";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

	import EmptyState from "#lib/components/empty-state.svelte";
	import Fab from "#lib/components/fab.svelte";
	import IntegrationAlerts from "#lib/components/plugins/integration-alerts.svelte";
	import PluginRow from "#lib/components/plugins/plugin-row.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { kindInfo } from "#lib/plugins.js";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();

	const addPath = resolve("/(protected)/integrations/add");

	setPageTitle("Integrations", undefined, [
		{
			label: "Add an integration",
			icon: PlusIcon,
			primary: true,
			href: addPath,
		},
	]);

	const connected = $derived(
		new Set(
			data.pluginSetups
				.filter((setup) => setup.connected)
				.map((setup) => setup.id),
		),
	);
	const inUse = $derived(
		data.plugins.filter(
			(plugin) =>
				plugin.devices > 0 ||
				connected.has(plugin.id) ||
				plugin.loadError !== null ||
				!plugin.official,
		),
	);

	const devicesOf = (pluginId: string) =>
		data.setup.filter(
			(device) => kindInfo(data.kinds, device.kind).plugin === pluginId,
		);
</script>

<IntegrationAlerts problems={data.integrationProblems} />

<section
	class="flex flex-col gap-4"
	class:mt-6={data.integrationProblems.length > 0}
	aria-labelledby="installed-heading"
>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 id="installed-heading" class="font-semibold">Set up</h2>
			<p class="text-muted-foreground text-sm">
				The integrations this house uses, with their devices.
			</p>
		</div>
		<form
			method="POST"
			action="?/check"
			use:enhance={enhanceToast({
				loading: "Checking every source",
				success: "Checked for updates.",
			})}
		>
			<Button type="submit" variant="ghost" class="h-11 rounded-xl px-4"
				><RefreshCwIcon />Check for updates</Button
			>
		</form>
	</div>
	{#if inUse.length === 0}
		<div class="glass rounded-2xl">
			<EmptyState
				icon={PuzzleIcon}
				title="Nothing set up yet"
				subtitle="Pick an integration, connect it, and its devices show up here."
			>
				<Button href={addPath} class="h-11 rounded-xl px-5"
					><PlusIcon />Add an integration</Button
				>
			</EmptyState>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
			{#each inUse as plugin (plugin.id)}
				<PluginRow {plugin} devices={devicesOf(plugin.id)} />
			{/each}
		</div>
	{/if}
</section>

<Fab label="Add an integration" icon={PlusIcon} onclick={() => goto(addPath)} />
