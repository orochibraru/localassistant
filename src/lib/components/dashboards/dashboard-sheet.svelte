<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import ChartLineIcon from "@lucide/svelte/icons/chart-line";
	import CheckIcon from "@lucide/svelte/icons/check";
	import CloudSunIcon from "@lucide/svelte/icons/cloud-sun";
	import HeadingIcon from "@lucide/svelte/icons/heading";
	import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import UsersIcon from "@lucide/svelte/icons/users";
	import XIcon from "@lucide/svelte/icons/x";
	import { type Component, untrack } from "svelte";

	import ChoiceRow from "#lib/components/automations/choice-row.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import type { DashboardSection } from "#lib/dashboards.js";
	import { historyRanges } from "#lib/history.js";
	import type { PluginCard } from "#lib/plugins.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Props {
		open: boolean;
		editing: { id: string; name: string; sections: DashboardSection[] } | null;
		devices: { id: string; card: PluginCard; name: string }[];
		scenes: { id: string; name: string }[];
	}

	let { open = $bindable(), editing, devices, scenes }: Props = $props();

	let name = $state("");
	let sections = $state<DashboardSection[]>([]);

	$effect(() => {
		const current = editing;
		if (open) {
			untrack(() => {
				name = current?.name ?? "";
				sections = current
					? structuredClone($state.snapshot(current.sections))
					: [{ type: "devices", deviceIds: [] }];
			});
		}
	});

	const graphCards = new Set<PluginCard>([
		"sensor",
		"meter",
		"switch",
		"climate",
		"valve",
		"light",
		"fan",
		"cover",
		"vacuum",
	]);
	const deviceOptions = $derived(
		devices.map((device) => ({ value: device.id, label: device.name })),
	);
	const graphOptions = $derived(
		devices
			.filter((device) => graphCards.has(device.card))
			.map((device) => ({ value: device.id, label: device.name })),
	);
	const sceneOptions = $derived(
		scenes.map((scene) => ({ value: scene.id, label: scene.name })),
	);

	const labels: Record<DashboardSection["type"], string> = {
		heading: "Heading",
		devices: "Devices",
		scenes: "Scenes",
		weather: "Weather",
		people: "Who's home",
		graph: "History graph",
	};
	const icons: Record<
		DashboardSection["type"],
		Component<{ class?: string }>
	> = {
		heading: HeadingIcon,
		devices: LayoutGridIcon,
		scenes: SparklesIcon,
		weather: CloudSunIcon,
		people: UsersIcon,
		graph: ChartLineIcon,
	};

	const addable = $derived(
		[
			{
				type: "heading" as const,
				available: true,
				make: (): DashboardSection => ({ type: "heading", text: "" }),
			},
			{
				type: "devices" as const,
				available: devices.length > 0,
				make: (): DashboardSection => ({ type: "devices", deviceIds: [] }),
			},
			{
				type: "scenes" as const,
				available: scenes.length > 0,
				make: (): DashboardSection => ({ type: "scenes", sceneIds: [] }),
			},
			{
				type: "weather" as const,
				available: true,
				make: (): DashboardSection => ({ type: "weather" }),
			},
			{
				type: "people" as const,
				available: true,
				make: (): DashboardSection => ({ type: "people" }),
			},
			{
				type: "graph" as const,
				available: graphOptions.length > 0,
				make: (): DashboardSection => ({
					type: "graph",
					deviceId: graphOptions[0]?.value ?? "",
					range: "day",
				}),
			},
		].filter((entry) => entry.available),
	);

	function move(index: number, step: number) {
		const target = index + step;
		const section = sections[index];
		const other = sections[target];
		if (section && other) {
			sections[target] = section;
			sections[index] = other;
		}
	}
</script>

<ResponsiveSheet
	bind:open
	wide
	title={editing ? `Edit ${editing.name}` : "New dashboard"}
	description="Only you see it. Pick what it shows and in which order."
>
	<form
		method="POST"
		action="{resolve('/(protected)/dashboards')}?/save"
		class="flex flex-col gap-6 pb-6"
		use:enhance={enhanceToast({
			loading: "Saving",
			success: () => `${name || "Dashboard"} saved.`,
			onSuccess: () => {
				open = false;
			},
		})}
	>
		<input type="hidden" name="id" value={editing?.id ?? ""} />
		<input
			type="hidden"
			name="definition"
			value={JSON.stringify({ name, sections })}
		/>
		<Field.Field>
			<Field.Label for="dashboard-name">Name</Field.Label>
			<Input
				id="dashboard-name"
				bind:value={name}
				placeholder="Bedtime"
				required
				class="h-11"
			/>
		</Field.Field>

		<Field.Set>
			<Field.Legend>Shows</Field.Legend>
			<ul class="flex flex-col gap-3">
				{#each sections as section, index (index)}
					{@const Icon = icons[section.type]}
					<li class="bg-secondary/50 flex flex-col gap-3 rounded-2xl p-3">
						<div class="flex items-center gap-1">
							<Icon class="text-muted-foreground mr-1 size-5 shrink-0" />
							<span class="flex-1 font-medium">{labels[section.type]}</span>
							<IconButton
								label="Move up"
								icon={ArrowUpIcon}
								disabled={index === 0}
								onclick={() => move(index, -1)}
							/>
							<IconButton
								label="Move down"
								icon={ArrowDownIcon}
								disabled={index === sections.length - 1}
								onclick={() => move(index, 1)}
							/>
							<IconButton
								label="Take it out"
								icon={XIcon}
								onclick={() => sections.splice(index, 1)}
							/>
						</div>
						{#if section.type === "heading"}
							<Input
								aria-label="Heading"
								bind:value={section.text}
								placeholder="Downstairs"
								class="h-11"
							/>
						{:else if section.type === "devices"}
							<Picker
								id="section-{index}-devices"
								name=""
								label="Devices"
								options={deviceOptions}
								multiple
								bind:values={section.deviceIds}
								placeholder="Pick the devices, in the order to show them"
							/>
						{:else if section.type === "scenes"}
							<Picker
								id="section-{index}-scenes"
								name=""
								label="Scenes"
								options={sceneOptions}
								multiple
								bind:values={section.sceneIds}
								placeholder="Pick the scenes"
							/>
						{:else if section.type === "graph"}
							<Picker
								id="section-{index}-device"
								name=""
								label="Device"
								options={graphOptions}
								value={section.deviceId}
								onPick={(next) => (section.deviceId = next)}
							/>
							<ChoiceRow
								label="Over"
								options={historyRanges.map((value) => ({
									value,
									label: value === "day" ? "24 hours" : "7 days",
								}))}
								value={section.range}
								onChange={(next) =>
									(section.range = next === "week" ? "week" : "day")}
							/>
						{:else if section.type === "weather"}
							<p class="text-muted-foreground text-sm">
								The weather at home, like on Home.
							</p>
						{:else}
							<p class="text-muted-foreground text-sm">
								Who's home and who's away.
							</p>
						{/if}
					</li>
				{/each}
			</ul>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="outline"
							class="h-11 self-start rounded-xl px-5"><PlusIcon />Add</Button
						>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="w-56">
					{#each addable as entry (entry.type)}
						{@const Icon = icons[entry.type]}
						<DropdownMenu.Item onSelect={() => sections.push(entry.make())}>
							<Icon />{labels[entry.type]}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</Field.Set>

		<Button type="submit" class="h-11 rounded-xl px-5"><CheckIcon />Save</Button
		>
	</form>
</ResponsiveSheet>
