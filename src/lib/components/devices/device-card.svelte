<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import { toast } from "svelte-sonner";

	import AppCard from "#lib/components/devices/app-card.svelte";
	import CameraCard from "#lib/components/devices/camera-card.svelte";
	import ClimateCard from "#lib/components/devices/climate-card.svelte";
	import CoverCard from "#lib/components/devices/cover-card.svelte";
	import PrinterCard from "#lib/components/devices/printer-card.svelte";
	import SensorCard from "#lib/components/devices/sensor-card.svelte";
	import SwitchCard from "#lib/components/devices/switch-card.svelte";
	import VacuumCard from "#lib/components/devices/vacuum-card.svelte";
	import ValveCard from "#lib/components/devices/valve-card.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import {
		type CardSize,
		cardSizeLabels,
		cardSizes,
		type DeviceState,
	} from "#lib/devices.js";
	import { resizeCard, showCardDetails } from "#lib/remote/devices.remote.js";
	import { useSheets } from "#lib/sheets.svelte.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		device: {
			id: string;
			kind: string;
			externalId?: string;
			ownerId?: string | null;
			name: string;
			state: DeviceState | null;
			stateError: string | null;
			stateAt: Date | null;
		};
		now: number;
		size: CardSize;
	}

	const { device, now, size }: Props = $props();

	const sheets = useSheets();
	let menuOpen = $state(false);
	let chosenSize = $derived<string>(size);
	const canSetUp = $derived(
		page.data.isAdmin === true && page.route.id !== "/(protected)/panel",
	);

	const reading = $derived(device.state);
	const ownerName = $derived(
		page.data.people?.find(
			(person: { id: string }) => person.id === device.ownerId,
		)?.name ?? null,
	);
	const home = $derived(
		page.data.home?.latitude != null && page.data.home.longitude != null
			? {
					latitude: page.data.home.latitude,
					longitude: page.data.home.longitude,
				}
			: null,
	);

	async function resizeCallback(next: CardSize) {
		try {
			await resizeCard({ deviceId: device.id, size: next });
			await invalidateAll();
		} catch (failure) {
			chosenSize = size;
			throw failure;
		}
	}

	function handleResize(next: string) {
		if (!next) {
			chosenSize = size;
			return;
		}
		if (next === size) {
			return;
		}
		toast.promise(resizeCallback(next as CardSize), {
			loading: "Resizing the card",
			success: `${device.name} is now ${cardSizeLabels[next as CardSize].toLowerCase()}.`,
			error: (failure) => toastError(failure),
		});
	}

	const hasDetails = $derived(device.kind === "linky");
	const detailsShown = $derived(
		!(page.data.cardLayout?.brief ?? []).includes(device.id),
	);

	async function detailsCallback(shown: boolean) {
		await showCardDetails({ deviceId: device.id, shown });
		await invalidateAll();
	}

	function handleDetails(shown: boolean) {
		toast.promise(detailsCallback(shown), {
			loading: shown ? "Showing the details" : "Hiding the details",
			success: shown ? "Details shown." : "Details hidden.",
			error: (failure) => toastError(failure),
		});
	}

	function openSetup() {
		menuOpen = false;
		sheets.editDeviceId = device.id;
	}
</script>

{#snippet card(compact: boolean, onMore?: () => void)}
	{#if device.kind === "tuya-cover"}
		<CoverCard
			id={device.id}
			name={device.name}
			reading={reading?.type === "cover" ? reading : null}
			error={device.stateError}
			readAt={device.stateAt}
			{now}
			{compact}
			{onMore}
		/>
	{:else if device.kind === "bambu-printer"}
		<PrinterCard
			id={device.id}
			name={device.name}
			reading={reading?.type === "printer" ? reading : null}
			error={device.stateError}
			readAt={device.stateAt}
			{now}
			{compact}
			{onMore}
		/>
	{:else if device.kind === "dreame-vacuum"}
		<VacuumCard
			id={device.id}
			name={device.name}
			reading={reading?.type === "vacuum" ? reading : null}
			error={device.stateError}
			readAt={device.stateAt}
			{now}
			{compact}
			{onMore}
		/>
	{:else if device.kind === "zigbee-contact" || device.kind === "zigbee-meter" || device.kind === "shelly-meter" || device.kind === "linky"}
		<SensorCard
			details={detailsShown
				? (page.data.energySummaries?.[device.id] ?? null)
				: null}
			id={device.id}
			name={device.name}
			error={device.stateError}
			reading={reading?.type === "contact" ||
			reading?.type === "meter" ||
			reading?.type === "linky"
				? reading
				: null}
			readAt={device.stateAt}
			{now}
			{compact}
			{onMore}
		/>
	{:else if device.kind === "zigbee-valve"}
		<ValveCard
			id={device.id}
			name={device.name}
			reading={reading?.type === "valve" ? reading : null}
			readAt={device.stateAt}
			{now}
			{compact}
			{onMore}
		/>
	{:else if device.kind === "zigbee-switch"}
		<SwitchCard
			id={device.id}
			name={device.name}
			reading={reading?.type === "switch" ? reading : null}
			readAt={device.stateAt}
			{now}
			{compact}
			{onMore}
		/>
	{:else if device.kind === "camera" || device.kind === "frigate-camera"}
		<CameraCard
			id={device.id}
			name={device.name}
			frigateName={device.kind === "frigate-camera"
				? (device.externalId ?? null)
				: null}
			reading={reading?.type === "camera" ? reading : null}
			error={device.stateError}
			{now}
			{compact}
			{onMore}
		/>
	{:else if device.kind === "app"}
		<AppCard
			id={device.id}
			name={device.name}
			{ownerName}
			reading={reading?.type === "app" ? reading : null}
			readAt={device.stateAt}
			{home}
			{now}
			{compact}
			{onMore}
		/>
	{:else}
		<ClimateCard
			id={device.id}
			name={device.name}
			reading={reading?.type === "climate" ? reading : null}
			error={device.stateError}
			readAt={device.stateAt}
			{now}
			{compact}
			{onMore}
		/>
	{/if}
{/snippet}

{@render card(size === "small", () => (menuOpen = true))}

<ResponsiveSheet bind:open={menuOpen} title={device.name} wide>
	<div class="flex flex-col gap-4 pb-6">
		{#if size === "small"}
			{@render card(false)}
		{/if}
		{#if hasDetails}
			<div class="bg-muted/60 flex min-h-14 items-center gap-3 rounded-xl px-3">
				<label for="{device.id}-details" class="min-w-0 flex-1 py-2">
					<span class="block font-medium">Show the details</span>
					<span class="text-muted-foreground block text-sm"
						>The last 7 days, this month against last month and the daily
						average.</span
					>
				</label>
				<Switch
					id="{device.id}-details"
					checked={detailsShown}
					onCheckedChange={handleDetails}
				/>
			</div>
		{/if}
		<div class="flex flex-col gap-2">
			<p class="text-sm font-medium">Card size</p>
			<ToggleGroup.Root
				type="single"
				bind:value={chosenSize}
				spacing={2}
				aria-label="{device.name} card size"
				class="w-full"
				onValueChange={handleResize}
			>
				{#each cardSizes as option (option)}
					<ToggleGroup.Item
						value={option}
						class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 rounded-xl"
						>{cardSizeLabels[option]}</ToggleGroup.Item
					>
				{/each}
			</ToggleGroup.Root>
		</div>
		{#if canSetUp}
			<Button variant="outline" class="h-11 rounded-xl" onclick={openSetup}
				><SettingsIcon />Device settings</Button
			>
		{/if}
	</div>
</ResponsiveSheet>
