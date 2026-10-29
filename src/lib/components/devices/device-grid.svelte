<script lang="ts">
	import { page } from "$app/state";
	import type { ComponentProps } from "svelte";

	import DeviceCard from "#lib/components/devices/device-card.svelte";
	import { type CardSize, cardSizeOf } from "#lib/devices.js";

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

	const spans: Record<CardSize, string> = {
		small: "",
		medium: "@min-[25rem]:col-span-2",
		large: "@min-[25rem]:col-span-2 @min-[40rem]:col-span-4",
	};

	const sorted = $derived(
		devices.toSorted(
			(first, second) =>
				(kindOrder[first.kind] ?? 9) - (kindOrder[second.kind] ?? 9) ||
				first.name.localeCompare(second.name),
		),
	);
</script>

<div class="@container">
	<ul
		class="grid grid-flow-dense gap-3 @min-[25rem]:grid-cols-2 @min-[40rem]:grid-cols-4 @min-[62rem]:grid-cols-6 @min-[84rem]:grid-cols-8 md:gap-4"
	>
		{#each sorted as device (device.id)}
			{@const size = cardSizeOf(page.data.cardSizes, device)}
			<li class={spans[size]}><DeviceCard {device} {now} {size} /></li>
		{/each}
	</ul>
</div>
