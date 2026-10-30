<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import {
		kindIcon,
		pluginIconComponents,
	} from "#lib/components/devices/device-kinds.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { roomLabels } from "#lib/house.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { kindInfo, type PluginSetup } from "#lib/plugins.js";
	import { useSheets } from "#lib/sheets.svelte.js";

	const { data } = $props();

	const sheets = useSheets();

	setPageTitle("Devices", undefined, [
		{
			label: "Add a device",
			icon: PlusIcon,
			primary: true,
			onSelect: () => (sheets.pickDevice = true),
		},
	]);

	const roomNames = $derived(roomLabels(data.rooms, data.floors));

	function summary(setup: PluginSetup): string {
		if (setup.needs.includes("mqtt") && !data.brokerUrl) {
			return "Needs the MQTT broker.";
		}
		if (setup.connection) {
			return setup.connected ? setup.connection.connected : "Not connected.";
		}
		return setup.description;
	}
</script>

<div
	class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(20rem,28rem)_1fr] lg:items-start"
>
	<section
		class="glass flex flex-col gap-2 rounded-2xl p-2"
		aria-labelledby="integrations-heading"
	>
		<h2 id="integrations-heading" class="px-2 pt-2 font-semibold">
			Integrations
		</h2>
		<ul class="flex flex-col">
			{#each data.pluginSetups as setup (setup.id)}
				{@const Icon = pluginIconComponents[setup.icon]}
				<li>
					<button
						type="button"
						class="hover:bg-muted/50 flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors"
						onclick={() => (sheets.addDevice = setup.id)}
					>
						<span
							class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
							aria-hidden="true"
						>
							<Icon class="size-5" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium">{setup.name}</span>
							<span class="text-muted-foreground line-clamp-2 text-sm"
								>{summary(setup)}</span
							>
						</span>
						{#if setup.connection && setup.connected}
							<SettingsIcon class="text-muted-foreground size-4 shrink-0" />
						{:else}
							<PlusIcon class="text-muted-foreground size-4 shrink-0" />
						{/if}
					</button>
				</li>
			{/each}
		</ul>
		<Button
			href={resolve("/(protected)/admin/plugins")}
			variant="outline"
			class="m-2 h-11 rounded-xl px-5"
			><PuzzleIcon />Get more integrations</Button
		>
	</section>

	{#if data.devices.length > 0}
		<ul class="glass divide-border divide-y rounded-2xl">
			{#each data.devices as device (device.id)}
				{@const Icon = kindIcon(data.kinds, device.kind)}
				<li>
					<button
						type="button"
						class="hover:bg-muted/50 flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl md:px-4"
						onclick={() => (sheets.editDeviceId = device.id)}
					>
						<span
							class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
							aria-hidden="true"
						>
							<Icon class="size-5" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium">{device.name}</span>
							<span class="text-muted-foreground block truncate text-sm">
								{kindInfo(data.kinds, device.kind).label}, {device.roomId
									? (roomNames.get(device.roomId) ?? "Whole house")
									: "Whole house"}
							</span>
						</span>
						{#if device.stateError}
							<Badge variant="destructive">Unreachable</Badge>
						{:else if device.state}
							<Badge variant="secondary">Online</Badge>
						{:else}
							<Badge variant="outline">Not read yet</Badge>
						{/if}
						<ChevronRightIcon class="text-muted-foreground size-4 shrink-0" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
