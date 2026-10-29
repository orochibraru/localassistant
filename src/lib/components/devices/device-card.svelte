<script lang="ts">
	import { page } from "$app/state";

	import AppCard from "#lib/components/devices/app-card.svelte";
	import CameraCard from "#lib/components/devices/camera-card.svelte";
	import ClimateCard from "#lib/components/devices/climate-card.svelte";
	import CoverCard from "#lib/components/devices/cover-card.svelte";
	import PrinterCard from "#lib/components/devices/printer-card.svelte";
	import SensorCard from "#lib/components/devices/sensor-card.svelte";
	import SwitchCard from "#lib/components/devices/switch-card.svelte";
	import VacuumCard from "#lib/components/devices/vacuum-card.svelte";
	import ValveCard from "#lib/components/devices/valve-card.svelte";
	import type { DeviceState } from "#lib/devices.js";

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
	}

	const { device, now }: Props = $props();

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
</script>

{#if device.kind === "tuya-cover"}
	<CoverCard
		id={device.id}
		name={device.name}
		reading={reading?.type === "cover" ? reading : null}
		error={device.stateError}
		readAt={device.stateAt}
		{now}
	/>
{:else if device.kind === "bambu-printer"}
	<PrinterCard
		id={device.id}
		name={device.name}
		reading={reading?.type === "printer" ? reading : null}
		error={device.stateError}
		readAt={device.stateAt}
		{now}
	/>
{:else if device.kind === "dreame-vacuum"}
	<VacuumCard
		id={device.id}
		name={device.name}
		reading={reading?.type === "vacuum" ? reading : null}
		error={device.stateError}
		readAt={device.stateAt}
		{now}
	/>
{:else if device.kind === "zigbee-contact" || device.kind === "zigbee-meter" || device.kind === "shelly-meter" || device.kind === "linky"}
	<SensorCard
		name={device.name}
		error={device.stateError}
		reading={reading?.type === "contact" ||
		reading?.type === "meter" ||
		reading?.type === "linky"
			? reading
			: null}
		readAt={device.stateAt}
		{now}
	/>
{:else if device.kind === "zigbee-valve"}
	<ValveCard
		id={device.id}
		name={device.name}
		reading={reading?.type === "valve" ? reading : null}
		readAt={device.stateAt}
		{now}
	/>
{:else if device.kind === "zigbee-switch"}
	<SwitchCard
		id={device.id}
		name={device.name}
		reading={reading?.type === "switch" ? reading : null}
		readAt={device.stateAt}
		{now}
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
	/>
{:else if device.kind === "app"}
	<AppCard
		name={device.name}
		{ownerName}
		reading={reading?.type === "app" ? reading : null}
		readAt={device.stateAt}
		{home}
		{now}
	/>
{:else}
	<ClimateCard
		id={device.id}
		name={device.name}
		reading={reading?.type === "climate" ? reading : null}
		error={device.stateError}
		readAt={device.stateAt}
		{now}
	/>
{/if}
