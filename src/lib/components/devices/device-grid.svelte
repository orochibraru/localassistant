<script lang="ts">
	import type { ComponentProps } from "svelte";

	import DeviceCard from "#lib/components/devices/device-card.svelte";

	type Device = ComponentProps<typeof DeviceCard>["device"];

	interface Props {
		devices: Device[];
		now: number;
	}

	const { devices, now }: Props = $props();

	const kindOrder: Record<string, number> = {
		"melcloud-ata": 0,
		"melcloud-atw": 0,
		"esphome-climate": 0,
		"tuya-cover": 1,
		"bambu-printer": 2,
		"zigbee-valve": 0,
		"zigbee-contact": 1,
		"zigbee-switch": 3,
		"dreame-vacuum": 3,
		"zigbee-meter": 4,
		"shelly-meter": 4,
		linky: 4,
		camera: -1,
		"frigate-camera": -1,
		app: 5,
	};

	const sorted = $derived(
		devices.toSorted(
			(first, second) =>
				(kindOrder[first.kind] ?? 9) - (kindOrder[second.kind] ?? 9) ||
				first.name.localeCompare(second.name),
		),
	);
</script>

<ul
	class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] md:gap-4"
>
	{#each sorted as device (device.id)}
		<li><DeviceCard {device} {now} /></li>
	{/each}
</ul>
