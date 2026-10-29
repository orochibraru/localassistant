<script lang="ts">
	import { page } from "$app/state";
	import GripIcon from "@lucide/svelte/icons/grip";
	import type { ComponentProps } from "svelte";
	import { flip } from "svelte/animate";

	import DeviceCard from "#lib/components/devices/device-card.svelte";
	import { type CardSize, moveCard } from "#lib/devices.js";
	import { cardSizeOf, sortCards } from "#lib/plugins.js";

	type Device = ComponentProps<typeof DeviceCard>["device"];

	interface Props {
		devices: Device[];
		now: number;
		order?: string[];
		arranging?: boolean;
		onArrange?: (ids: string[]) => void;
	}

	const { devices, now, order, arranging = false, onArrange }: Props = $props();

	const spans: Record<CardSize, string> = {
		small: "",
		medium: "@min-[25rem]:col-span-2",
		large: "@min-[25rem]:col-span-2 @min-[40rem]:col-span-4",
	};

	let dragging = $state<string | null>(null);

	const sorted = $derived(
		sortCards(
			devices,
			order ?? page.data.cardLayout?.order ?? [],
			page.data.kinds,
		),
	);
	const ids = $derived(sorted.map((device) => device.id));

	function startDrag(event: PointerEvent, id: string) {
		if (!arranging || event.button !== 0) {
			return;
		}
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		dragging = id;
	}

	function followDrag(event: PointerEvent) {
		if (!dragging) {
			return;
		}
		const target = document
			.elementsFromPoint(event.clientX, event.clientY)
			.map((element) => element.closest<HTMLElement>("[data-card-id]"))
			.find((element) => element && element.dataset.cardId !== dragging)
			?.dataset.cardId;
		if (target && ids.includes(target)) {
			onArrange?.(moveCard(ids, dragging, target));
		}
	}

	function handleKey(event: KeyboardEvent, id: string) {
		const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[
			event.key
		];
		const target = step === undefined ? undefined : ids[ids.indexOf(id) + step];
		if (target) {
			event.preventDefault();
			onArrange?.(moveCard(ids, id, target));
		}
	}
</script>

<div class="@container">
	<ul
		class="grid gap-3 @min-[25rem]:grid-cols-2 @min-[40rem]:grid-cols-4 @min-[62rem]:grid-cols-6 @min-[84rem]:grid-cols-8 md:gap-4"
	>
		{#each sorted as device (device.id)}
			{@const size = cardSizeOf(page.data.cardSizes, device, page.data.kinds)}
			<li
				class="relative {spans[size]}"
				data-card-id={device.id}
				animate:flip={{ duration: 200 }}
			>
				<div
					class={arranging ? "pointer-events-none select-none" : ""}
					inert={arranging}
				>
					<DeviceCard {device} {now} {size} />
				</div>
				{#if arranging}
					<button
						type="button"
						class="border-primary/50 bg-background/20 absolute inset-0 z-10 flex cursor-grab touch-none items-start justify-end rounded-2xl border-2 border-dashed p-2 {dragging ===
						device.id
							? 'border-primary bg-primary/10 cursor-grabbing'
							: ''}"
						aria-label="Move {device.name}: drag it, or use the arrow keys"
						onpointerdown={(event) => startDrag(event, device.id)}
						onpointermove={followDrag}
						onpointerup={() => (dragging = null)}
						onpointercancel={() => (dragging = null)}
						onkeydown={(event) => handleKey(event, device.id)}
					>
						<span
							class="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full shadow"
							aria-hidden="true"
						>
							<GripIcon class="size-5" />
						</span>
					</button>
				{/if}
			</li>
		{/each}
	</ul>
</div>
