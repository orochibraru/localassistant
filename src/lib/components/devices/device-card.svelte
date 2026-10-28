<script lang="ts">
	import ClimateCard from "#lib/components/devices/climate-card.svelte";
	import CoverCard from "#lib/components/devices/cover-card.svelte";
	import PrinterCard from "#lib/components/devices/printer-card.svelte";
	import type { DeviceState } from "#lib/devices.js";

	interface Props {
		device: {
			id: string;
			kind: string;
			name: string;
			state: DeviceState | null;
			stateError: string | null;
			stateAt: Date | null;
		};
		now: number;
	}

	const { device, now }: Props = $props();

	const reading = $derived(device.state);
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
