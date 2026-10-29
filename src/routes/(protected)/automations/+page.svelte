<script lang="ts">
	import { enhance } from "$app/forms";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import WorkflowIcon from "@lucide/svelte/icons/workflow";
	import { tick } from "svelte";

	import {
		describeAction,
		describePeriod,
		describeTrigger,
	} from "#lib/automations.js";
	import AutomationSheet from "#lib/components/automations/automation-sheet.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import Fab from "#lib/components/fab.svelte";
	import ItemMenu from "#lib/components/item-menu.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { readAgo } from "#lib/devices.js";
	import { roomLabels } from "#lib/house.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { saveToast } from "#lib/toast.js";

	const { data } = $props();

	type Automation = (typeof data.automations)[number];

	let sheetOpen = $state(false);
	const toggles = $state<Record<string, HTMLFormElement | undefined>>({});
	let editing = $state<Automation | null>(null);
	function openSheet(automation: Automation | null) {
		editing = automation;
		sheetOpen = true;
	}

	setPageTitle("Automations", undefined, () => [
		{
			label: "New automation",
			icon: PlusIcon,
			onSelect: () => openSheet(null),
			primary: true,
		},
	]);

	const names = $derived({
		devices: new Map(data.setup.map((device) => [device.id, device.name])),
		rooms: roomLabels(data.rooms, data.floors),
	});
</script>

{#if data.automations.length === 0}
	<div class="glass rounded-2xl">
		<EmptyState
			icon={WorkflowIcon}
			title="No automation yet"
			subtitle="Close the blinds at sunset in winter, at a set time in summer, or when it gets hot outside."
		>
			<Button class="h-11 rounded-xl px-5" onclick={() => openSheet(null)}
				><PlusIcon />New automation</Button
			>
		</EmptyState>
	</div>
{:else}
	<ul
		class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] md:gap-4"
	>
		{#each data.automations as automation (automation.id)}
			<li class="glass flex flex-col gap-3 rounded-2xl p-4">
				<div class="flex items-start gap-3">
					<ItemMenu
						title={automation.name}
						class="min-w-0 flex-1"
						actions={[
							{
								label: "Run now",
								icon: PlayIcon,
								form: {
									action: "?/run",
									fields: { id: automation.id },
									loading: "Starting",
									success: `${automation.name} is running.`,
								},
							},
							{
								label: "Edit",
								icon: PencilIcon,
								onSelect: () => openSheet(automation),
							},
							{
								label: "Delete",
								icon: Trash2Icon,
								destructive: true,
								form: {
									action: "?/remove",
									fields: { id: automation.id },
									loading: "Deleting",
									success: `${automation.name} deleted.`,
									confirm: {
										title: `Delete ${automation.name}?`,
										description: "It stops for everyone.",
										confirmLabel: "Delete",
									},
								},
							},
						]}
					>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-semibold">{automation.name}</span
							>
							<span class="text-muted-foreground block text-sm"
								>{describeTrigger(automation.trigger)}, {describePeriod(
									automation.period,
								).toLowerCase()}</span
							>
						</span>
					</ItemMenu>
					<form
						bind:this={toggles[automation.id]}
						method="POST"
						action="?/toggle"
						use:enhance={saveToast(automation.name)}
					>
						<input type="hidden" name="id" value={automation.id} />
						<Switch
							name="enabled"
							value="true"
							checked={automation.enabled}
							aria-label="{automation.name} on"
							onCheckedChange={() =>
								void tick().then(() => toggles[automation.id]?.requestSubmit())}
							class="mt-1"
						/>
					</form>
				</div>
				<ul class="text-sm">
					{#each automation.actions as action, index (index)}
						<li>{describeAction(action, names)}</li>
					{/each}
				</ul>
				{#if automation.runError}
					<p class="text-destructive text-sm">{automation.runError}</p>
				{/if}
				<p class="text-muted-foreground text-xs">
					{automation.ranAt
						? `Last ran ${readAgo(automation.ranAt)}`
						: "Hasn't run yet"}
				</p>
			</li>
		{/each}
	</ul>
{/if}

<Fab label="New automation" icon={PlusIcon} onclick={() => openSheet(null)} />

<AutomationSheet
	bind:open={sheetOpen}
	{editing}
	devices={data.setup}
	rooms={data.rooms}
	floors={data.floors}
	hasLocation={data.hasLocation}
/>
