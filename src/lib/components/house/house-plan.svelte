<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import MapPinOffIcon from "@lucide/svelte/icons/map-pin-off";
	import MoveDiagonalIcon from "@lucide/svelte/icons/move-diagonal-2";
	import ScissorsIcon from "@lucide/svelte/icons/scissors";
	import SquareMinusIcon from "@lucide/svelte/icons/square-minus";
	import ZoomInIcon from "@lucide/svelte/icons/zoom-in";
	import ZoomOutIcon from "@lucide/svelte/icons/zoom-out";
	import { type Component, type Snippet, tick } from "svelte";
	import { MediaQuery } from "svelte/reactivity";

	import { longPress } from "#lib/actions/long-press.js";
	import { kindIcon } from "#lib/components/devices/device-kinds.js";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Drawer from "#lib/components/ui/drawer/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import {
		extendPart,
		planOutline,
		type PlanSide,
		planSize,
		type RoomPlan,
		splitPart,
	} from "#lib/house.js";
	import { roomIcon } from "#lib/room-icons.js";

	interface PlanRoom {
		id: string;
		name: string;
		icon: string;
		plan: RoomPlan[] | null;
	}

	interface PlanPin {
		place: string;
		x: number;
		y: number;
	}

	interface PlanDevice {
		id: string;
		name: string;
		kind: string;
		roomId: string | null;
		pin: PlanPin | null;
	}

	interface Grip {
		part: number | null;
		resizing: boolean;
	}

	interface Props {
		rooms: PlanRoom[];
		devices: PlanDevice[];
		editing: boolean;
		outline?: { id: string; icon: string; plan: RoomPlan[] }[];
		onShape: (roomId: string, plan: RoomPlan[] | null) => void;
		onMove: (deviceId: string, roomId: string | null) => void;
		onPin: (deviceId: string, pin: PlanPin | null) => void;
		place: string;
		aside?: Snippet;
	}

	const {
		rooms,
		devices,
		editing,
		outline = [],
		onShape,
		onMove,
		onPin,
		place,
		aside,
	}: Props = $props();

	const wholeHouse = "house";
	const minimumSize = 1;
	const zoomRange = { min: 0.1, max: 4, step: 0.1 };
	const stairs = "stairs";
	const uid = $props.id();
	const desktop = new MediaQuery("(min-width: 768px)");
	const sides: {
		side: PlanSide;
		label: string;
		icon: Component<{ class?: string }>;
	}[] = [
		{ side: "right", label: "Extend to the right", icon: ArrowRightIcon },
		{ side: "down", label: "Extend down", icon: ArrowDownIcon },
		{ side: "left", label: "Extend to the left", icon: ArrowLeftIcon },
		{ side: "up", label: "Extend up", icon: ArrowUpIcon },
	];

	let canvas = $state<HTMLDivElement>();
	let viewport = $state<HTMLDivElement>();
	let zoom = $state(1);
	let draft = $state<Record<string, RoomPlan[]>>({});
	let roomDrag = $state<{
		roomId: string;
		part: number | null;
		resizing: boolean;
		startX: number;
		startY: number;
		start: RoomPlan[];
	} | null>(null);
	let deviceDrag = $state<{
		device: PlanDevice;
		x: number;
		y: number;
	} | null>(null);
	const touches = new Map<number, { x: number; y: number }>();
	let pinch: { distance: number; zoom: number } | null = null;

	const placed = $derived(
		rooms.flatMap((room) => {
			const parts = draft[room.id] ?? room.plan;
			return parts && parts.length > 0 ? [{ room, parts }] : [];
		}),
	);
	let menu = $state<{
		roomId: string;
		part: number;
		x: number;
		y: number;
	} | null>(null);
	const menuSheet = {
		get open() {
			return menu !== null;
		},
		set open(value: boolean) {
			if (!value) {
				menu = null;
			}
		},
	};
	const menuActions = $derived.by(() => {
		const entry = placed.find(({ room }) => room.id === menu?.roomId);
		const index = menu?.part ?? -1;
		const part = entry?.parts[index];
		if (!entry || !part) {
			return [];
		}
		const { room, parts } = entry;
		const actions: {
			label: string;
			icon: Component<{ class?: string }>;
			destructive?: boolean;
			run: () => void;
		}[] = sides.flatMap(({ side, label, icon }) => {
			const extra = extendPart(part, side);
			return extra
				? [{ label, icon, run: () => handlePlace(room.id, [...parts, extra]) }]
				: [];
		});
		const halves = splitPart(part);
		if (halves) {
			actions.push({
				label: "Split this part",
				icon: ScissorsIcon,
				run: () =>
					handlePlace(
						room.id,
						parts.flatMap((entry, position) =>
							position === index ? halves : [entry],
						),
					),
			});
		}
		if (parts.length > 1) {
			actions.push({
				label: "Remove this part",
				icon: SquareMinusIcon,
				destructive: true,
				run: () => removePart(room.id, parts, index),
			});
		}
		actions.push({
			label: "Take the room off the plan",
			icon: MapPinOffIcon,
			destructive: true,
			run: () => onShape(room.id, null),
		});
		return actions;
	});
	let hovered = $state<string | null>(null);
	const footprint = $derived(planOutline(placed.flatMap(({ parts }) => parts)));
	const houseDevices = $derived(
		devices.filter(
			(device) => device.roomId === null && device.pin?.place !== place,
		),
	);
	const pinned = $derived(
		devices.filter(
			(device) => device.roomId === null && device.pin?.place === place,
		),
	);

	function clamp(value: number, low: number, high: number): number {
		return Math.min(high, Math.max(low, value));
	}

	function largest(parts: RoomPlan[]): RoomPlan {
		return parts.reduce((best, part) =>
			part.width * part.height > best.width * best.height ? part : best,
		);
	}

	function percent(part: RoomPlan): string {
		return `left: ${(part.x / planSize.columns) * 100}%; top: ${(part.y / planSize.rows) * 100}%; width: ${(part.width / planSize.columns) * 100}%; height: ${(part.height / planSize.rows) * 100}%;`;
	}

	function shifted(parts: RoomPlan[], columns: number, rows: number) {
		const left = Math.min(...parts.map((part) => part.x));
		const top = Math.min(...parts.map((part) => part.y));
		const right = Math.max(...parts.map((part) => part.x + part.width));
		const bottom = Math.max(...parts.map((part) => part.y + part.height));
		const across = clamp(columns, -left, planSize.columns - right);
		const down = clamp(rows, -top, planSize.rows - bottom);
		return parts.map((part) => ({
			...part,
			x: part.x + across,
			y: part.y + down,
		}));
	}

	function moved(part: RoomPlan, columns: number, rows: number): RoomPlan {
		return {
			...part,
			x: clamp(part.x + columns, 0, planSize.columns - part.width),
			y: clamp(part.y + rows, 0, planSize.rows - part.height),
		};
	}

	function resized(part: RoomPlan, columns: number, rows: number): RoomPlan {
		return {
			...part,
			width: clamp(
				part.width + columns,
				minimumSize,
				planSize.columns - part.x,
			),
			height: clamp(part.height + rows, minimumSize, planSize.rows - part.y),
		};
	}

	function changed(
		parts: RoomPlan[],
		{ part, resizing }: Grip,
		columns: number,
		rows: number,
	): RoomPlan[] {
		if (part === null) {
			return shifted(parts, columns, rows);
		}
		return parts.map((entry, index) => {
			if (index !== part) {
				return entry;
			}
			return resizing
				? resized(entry, columns, rows)
				: moved(entry, columns, rows);
		});
	}

	function openMenu(roomId: string, part: number, x: number, y: number) {
		if (editing) {
			roomDrag = null;
			menu = { roomId, part, x, y };
		}
	}

	function runMenu(run: () => void) {
		menu = null;
		run();
	}

	function handlePlace(roomId: string, parts: RoomPlan[]) {
		onShape(roomId, parts);
	}

	function startRoomDrag(
		event: PointerEvent,
		roomId: string,
		parts: RoomPlan[],
		{ part, resizing }: Grip,
	) {
		if (!editing || event.button !== 0 || pinch) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		roomDrag = {
			roomId,
			part,
			resizing,
			startX: event.clientX,
			startY: event.clientY,
			start: parts,
		};
	}

	function followRoomDrag(event: PointerEvent) {
		if (!roomDrag || !canvas || pinch) {
			return;
		}
		const columns = Math.round(
			((event.clientX - roomDrag.startX) * planSize.columns) /
				canvas.clientWidth,
		);
		const rows = Math.round(
			((event.clientY - roomDrag.startY) * planSize.rows) / canvas.clientHeight,
		);
		draft[roomDrag.roomId] = changed(roomDrag.start, roomDrag, columns, rows);
	}

	function endRoomDrag() {
		if (!roomDrag) {
			return;
		}
		const { roomId, start } = roomDrag;
		roomDrag = null;
		const parts = draft[roomId];
		delete draft[roomId];
		if (parts && JSON.stringify(parts) !== JSON.stringify(start)) {
			handlePlace(roomId, parts);
		}
	}

	function handleRoomKey(
		event: KeyboardEvent,
		roomId: string,
		parts: RoomPlan[],
		part: number | null,
	) {
		const steps: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
		};
		const step = steps[event.key];
		if (!editing || !step) {
			return;
		}
		event.preventDefault();
		const next = changed(
			parts,
			{ part, resizing: event.shiftKey && part !== null },
			...step,
		);
		handlePlace(roomId, next);
	}

	function removePart(roomId: string, parts: RoomPlan[], part: number) {
		handlePlace(
			roomId,
			parts.filter((_, index) => index !== part),
		);
	}

	function startDeviceDrag(event: PointerEvent, device: PlanDevice) {
		if (!editing || event.button !== 0) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		deviceDrag = { device, x: event.clientX, y: event.clientY };
	}

	function followDeviceDrag(event: PointerEvent) {
		if (deviceDrag) {
			deviceDrag = { ...deviceDrag, x: event.clientX, y: event.clientY };
		}
	}

	function endDeviceDrag() {
		if (!deviceDrag) {
			return;
		}
		const { device, x, y } = deviceDrag;
		deviceDrag = null;
		const target = document
			.elementFromPoint(x, y)
			?.closest<HTMLElement>("[data-drop-room]")?.dataset.dropRoom;
		if (target) {
			if (target !== (device.roomId ?? wholeHouse)) {
				onMove(device.id, target === wholeHouse ? null : target);
			}
			if (device.pin) {
				onPin(device.id, null);
			}
			return;
		}
		const box = canvas?.getBoundingClientRect();
		if (
			box &&
			x >= box.left &&
			x <= box.right &&
			y >= box.top &&
			y <= box.bottom
		) {
			if (device.roomId !== null) {
				onMove(device.id, null);
			}
			onPin(device.id, {
				place,
				x: Math.round(((x - box.left) / box.width) * planSize.columns * 2) / 2,
				y: Math.round(((y - box.top) / box.height) * planSize.rows * 2) / 2,
			});
		}
	}

	$effect(() => {
		const element = viewport;
		if (!element) {
			return;
		}
		const onWheel = (event: WheelEvent) => {
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				void zoomTo(zoom * Math.exp(-event.deltaY / 200), event);
			}
		};
		element.addEventListener("wheel", onWheel, { passive: false });
		return () => element.removeEventListener("wheel", onWheel);
	});

	async function zoomTo(
		next: number,
		around?: { clientX: number; clientY: number },
	) {
		if (!viewport) {
			return;
		}
		const level = clamp(
			Math.round(next * 100) / 100,
			zoomRange.min,
			zoomRange.max,
		);
		const box = viewport.getBoundingClientRect();
		const anchorX = (around?.clientX ?? box.left + box.width / 2) - box.left;
		const anchorY = (around?.clientY ?? box.top + box.height / 2) - box.top;
		const ratio = level / zoom;
		const scrollLeft = (viewport.scrollLeft + anchorX) * ratio - anchorX;
		const scrollTop = (viewport.scrollTop + anchorY) * ratio - anchorY;
		zoom = level;
		await tick();
		viewport.scrollLeft = scrollLeft;
		viewport.scrollTop = scrollTop;
	}

	function spread(): number {
		const [first, second] = [...touches.values()];
		return first && second
			? Math.hypot(first.x - second.x, first.y - second.y)
			: 0;
	}

	function trackTouch(event: PointerEvent) {
		if (event.pointerType !== "touch") {
			return;
		}
		touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (touches.size === 2) {
			pinch = { distance: spread(), zoom };
			roomDrag = null;
			deviceDrag = null;
		}
	}

	function followTouch(event: PointerEvent) {
		if (!touches.has(event.pointerId)) {
			return;
		}
		touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch && touches.size === 2 && pinch.distance > 0) {
			const [first, second] = [...touches.values()];
			void zoomTo((pinch.zoom * spread()) / pinch.distance, {
				clientX: ((first?.x ?? 0) + (second?.x ?? 0)) / 2,
				clientY: ((first?.y ?? 0) + (second?.y ?? 0)) / 2,
			});
		}
	}

	function dropTouch(event: PointerEvent) {
		touches.delete(event.pointerId);
		if (touches.size < 2) {
			pinch = null;
		}
	}
</script>

{#snippet chip(device: PlanDevice)}
	{@const Icon = kindIcon(page.data.kinds, device.kind)}
	<li
		class="bg-card/90 text-foreground flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs shadow-sm {editing
			? 'pointer-events-auto min-h-11 cursor-grab touch-none'
			: ''} {deviceDrag?.device.id === device.id ? 'opacity-40' : ''}"
		title={device.name}
		onpointerdown={(event) => startDeviceDrag(event, device)}
		onpointermove={followDeviceDrag}
		onpointerup={endDeviceDrag}
		onpointercancel={() => (deviceDrag = null)}
	>
		<Icon class="text-muted-foreground size-3.5 shrink-0" />
		<span class="hidden truncate @[9rem]:inline">{device.name}</span>
		<span class="sr-only @[9rem]:hidden">{device.name}</span>
	</li>
{/snippet}

<div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
	<div class="relative">
		<div
			bind:this={viewport}
			class="bg-muted/40 touch-pan-x touch-pan-y overflow-auto overscroll-contain rounded-2xl border"
			onpointerdowncapture={trackTouch}
			onpointermovecapture={followTouch}
			onpointerupcapture={dropTouch}
			onpointercancelcapture={dropTouch}
		>
			<div
				bind:this={canvas}
				class="relative mx-auto aspect-3/2"
				style:width="{zoom * 100}%"
				style:background-image={editing
					? "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)"
					: "radial-gradient(circle, var(--border) 1px, transparent 1.5px)"}
				style:background-size="calc(100% / {planSize.columns}) calc(100% / {planSize.rows})"
			>
				<svg
					class="pointer-events-none absolute inset-0 size-full"
					viewBox="0 0 {planSize.columns} {planSize.rows}"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<defs>
						<pattern
							id="{uid}-stairs"
							width="0.5"
							height="0.5"
							patternUnits="userSpaceOnUse"
							patternTransform="rotate(45)"
						>
							<line
								x1="0"
								y1="0"
								x2="0"
								y2="0.5"
								stroke="var(--muted-foreground)"
								stroke-opacity="0.45"
								stroke-width="0.08"
							/>
						</pattern>
					</defs>
					{#each outline as base (base.id)}
						{#if base.icon === stairs}
							{#each base.plan as part, index (index)}
								<rect
									x={part.x}
									y={part.y}
									width={part.width}
									height={part.height}
									fill="url(#{uid}-stairs)"
									fill-opacity="0.6"
								/>
							{/each}
						{/if}
						<path
							d={planOutline(base.plan)}
							fill="none"
							stroke="var(--muted-foreground)"
							stroke-opacity="0.6"
							stroke-width="1.5"
							stroke-dasharray="6 4"
							vector-effect="non-scaling-stroke"
						/>
					{/each}
					<g class="drop-shadow-sm">
						{#each placed as { room, parts } (room.id)}
							{#each parts as part, index (index)}
								<rect
									x={part.x}
									y={part.y}
									width={part.width}
									height={part.height}
									fill="var(--card)"
								/>
							{/each}
						{/each}
					</g>
					{#each placed as { room, parts } (room.id)}
						{#each parts as part, index (index)}
							<rect
								x={part.x}
								y={part.y}
								width={part.width}
								height={part.height}
								fill={room.icon === stairs
									? `url(#${uid}-stairs)`
									: "var(--primary)"}
								fill-opacity={room.icon === stairs
									? 1
									: hovered === room.id
										? 0.14
										: 0.05}
							/>
						{/each}
						<path
							d={planOutline(parts)}
							fill="none"
							stroke={roomDrag?.roomId === room.id
								? "var(--primary)"
								: "var(--foreground)"}
							stroke-opacity={roomDrag?.roomId === room.id ? 1 : 0.3}
							stroke-width={roomDrag?.roomId === room.id ? 2.5 : 1.5}
							stroke-linecap="square"
							vector-effect="non-scaling-stroke"
						/>
					{/each}
					<path
						d={footprint}
						fill="none"
						stroke="var(--foreground)"
						stroke-opacity="0.75"
						stroke-width="4"
						stroke-linecap="square"
						stroke-linejoin="miter"
						vector-effect="non-scaling-stroke"
					/>
				</svg>

				{#each placed as { room, parts } (room.id)}
					{#each parts as part, index (index)}
						<svelte:element
							this={editing ? "div" : "a"}
							href={editing
								? undefined
								: resolve("/(protected)/rooms/[roomId]", { roomId: room.id })}
							role={editing ? "group" : undefined}
							tabindex={editing || index === 0 ? 0 : -1}
							aria-hidden={!editing && index > 0 ? "true" : undefined}
							aria-label={editing
								? `${room.name}, part ${index + 1}: drag or use the arrow keys to move it, Shift and the arrow keys to resize it`
								: room.name}
							data-drop-room={room.id}
							class="focus-visible:ring-ring absolute rounded-sm outline-none focus-visible:ring-2 {editing
								? 'cursor-move touch-none'
								: ''}"
							style={percent(part)}
							onpointerdown={(event: PointerEvent) =>
								startRoomDrag(event, room.id, parts, {
									part: index,
									resizing: false,
								})}
							onpointermove={followRoomDrag}
							onpointerup={endRoomDrag}
							onpointercancel={endRoomDrag}
							onkeydown={(event: KeyboardEvent) =>
								handleRoomKey(event, room.id, parts, index)}
							onpointerenter={() => (hovered = room.id)}
							onpointerleave={() => (hovered = null)}
							oncontextmenu={(event: MouseEvent) => {
								if (editing) {
									event.preventDefault();
									openMenu(room.id, index, event.clientX, event.clientY);
								}
							}}
						>
							{#if editing}
								<span
									class="absolute inset-0 [-webkit-touch-callout:none] select-none"
									aria-hidden="true"
									use:longPress={() => openMenu(room.id, index, 0, 0)}
								></span>
								<span
									class="text-muted-foreground absolute right-0 bottom-0 z-10 flex size-11 cursor-se-resize touch-none items-end justify-end p-1 md:size-7 md:p-0.5"
									aria-hidden="true"
									onpointerdown={(event) =>
										startRoomDrag(event, room.id, parts, {
											part: index,
											resizing: true,
										})}
									onpointermove={followRoomDrag}
									onpointerup={endRoomDrag}
									onpointercancel={endRoomDrag}
								>
									<MoveDiagonalIcon class="size-4" />
								</span>
							{/if}
						</svelte:element>
					{/each}
				{/each}

				{#each placed as { room, parts } (room.id)}
					{@const Icon = roomIcon(room.icon)}
					{@const label = largest(parts)}
					{@const inside = devices.filter(
						(device) => device.roomId === room.id,
					)}
					<div
						class="@container pointer-events-none absolute flex flex-col items-center justify-center gap-1.5 overflow-hidden p-2 text-center"
						style={percent(label)}
						data-drop-room={room.id}
					>
						{#if editing}
							<button
								type="button"
								class="bg-card pointer-events-auto flex max-w-full min-w-0 cursor-move touch-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm"
								aria-label="{room.name}: drag or use the arrow keys to move the whole room"
								onpointerdown={(event) =>
									startRoomDrag(event, room.id, parts, {
										part: null,
										resizing: false,
									})}
								onpointermove={followRoomDrag}
								onpointerup={endRoomDrag}
								onpointercancel={endRoomDrag}
								onkeydown={(event) =>
									handleRoomKey(event, room.id, parts, null)}
							>
								<Icon class="text-muted-foreground size-3.5 shrink-0" />
								<span class="truncate">{room.name}</span>
							</button>
						{:else}
							<span
								class="bg-accent text-accent-foreground hidden size-8 shrink-0 items-center justify-center rounded-full @[6rem]:flex"
								aria-hidden="true"
							>
								<Icon class="size-4" />
							</span>
							<p
								class="max-w-full shrink-0 truncate text-xs font-semibold @[8rem]:text-sm"
							>
								{room.name}
							</p>
						{/if}
						{#if inside.length > 0}
							<ul class="flex max-w-full flex-wrap justify-center gap-1">
								{#each inside as device (device.id)}
									{@render chip(device)}
								{/each}
							</ul>
						{/if}
					</div>
				{/each}

				{#each pinned as device (device.id)}
					<ul
						class="@container absolute z-10 -translate-x-1/2 -translate-y-1/2"
						style="left: {((device.pin?.x ?? 0) / planSize.columns) *
							100}%; top: {((device.pin?.y ?? 0) / planSize.rows) * 100}%;"
					>
						{@render chip(device)}
					</ul>
				{/each}
			</div>
		</div>

		<div
			class="bg-popover/90 absolute right-2 bottom-2 flex items-center gap-1 rounded-xl border p-1 shadow-sm"
		>
			<IconButton
				label="Zoom out of the plan"
				icon={ZoomOutIcon}
				variant="ghost"
				disabled={zoom <= zoomRange.min}
				onclick={() => zoomTo(zoom - zoomRange.step)}
			/>
			<Button
				variant="ghost"
				class="h-11 min-w-14 rounded-lg px-2 tabular-nums"
				aria-label="Fit the plan"
				onclick={() => zoomTo(1)}>{Math.round(zoom * 100)}%</Button
			>
			<IconButton
				label="Zoom into the plan"
				icon={ZoomInIcon}
				variant="ghost"
				disabled={zoom >= zoomRange.max}
				onclick={() => zoomTo(zoom + zoomRange.step)}
			/>
		</div>
	</div>

	<div class="flex flex-col gap-3">
		{#if houseDevices.length > 0 || editing}
			<svelte:element
				this={editing ? "div" : "a"}
				href={editing
					? undefined
					: resolve("/(protected)/rooms/[roomId]", { roomId: wholeHouse })}
				data-drop-room={wholeHouse}
				class="glass @container flex min-h-14 flex-col gap-2 rounded-xl border p-3 {editing
					? 'border-dashed'
					: 'hover:border-primary'}"
			>
				<p class="text-muted-foreground text-xs font-medium">
					Whole house{editing
						? ": drop a device here to take it out of its room"
						: ""}
				</p>
				{#if houseDevices.length > 0}
					<ul class="flex flex-wrap gap-1">
						{#each houseDevices as device (device.id)}
							{@render chip(device)}
						{/each}
					</ul>
				{/if}
			</svelte:element>
		{/if}
		{@render aside?.()}
	</div>
</div>

{#if deviceDrag}
	{@const Icon = kindIcon(page.data.kinds, deviceDrag.device.kind)}
	<div
		class="bg-primary text-primary-foreground pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs shadow-lg"
		style="left: {deviceDrag.x}px; top: {deviceDrag.y}px;"
	>
		<Icon class="size-3.5" />{deviceDrag.device.name}
	</div>
{/if}

{#if desktop.current}
	<DropdownMenu.Root bind:open={menuSheet.open}>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<span
					{...props}
					class="pointer-events-none fixed size-px"
					style="left: {menu?.x ?? 0}px; top: {menu?.y ?? 0}px;"
					aria-hidden="true"
				></span>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="min-w-56">
			{#each menuActions as action (action.label)}
				<DropdownMenu.Item
					variant={action.destructive ? "destructive" : "default"}
					onSelect={() => runMenu(action.run)}
				>
					<action.icon />
					{action.label}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{:else}
	<Drawer.Root bind:open={menuSheet.open}>
		<Drawer.Content>
			<Drawer.Header class="text-left">
				<Drawer.Title class="truncate"
					>{rooms.find((room) => room.id === menu?.roomId)?.name ??
						"Room"}</Drawer.Title
				>
			</Drawer.Header>
			<div class="flex flex-col gap-1 px-3 pb-4">
				{#each menuActions as action (action.label)}
					<Button
						variant="ghost"
						class="h-12 justify-start gap-3 rounded-xl px-3 text-base {action.destructive
							? 'text-destructive'
							: ''}"
						onclick={() => runMenu(action.run)}
					>
						<action.icon class="size-5" />
						{action.label}
					</Button>
				{/each}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
