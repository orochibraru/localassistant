<script lang="ts">
	import { beforeNavigate, invalidateAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import FileCodeIcon from "@lucide/svelte/icons/file-code";
	import FileJsonIcon from "@lucide/svelte/icons/file-json";
	import ImageIcon from "@lucide/svelte/icons/image";
	import MapIcon from "@lucide/svelte/icons/map";
	import PencilRulerIcon from "@lucide/svelte/icons/pencil-ruler";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SquarePlusIcon from "@lucide/svelte/icons/square-plus";
	import UndoIcon from "@lucide/svelte/icons/undo-2";
	import { toast } from "svelte-sonner";

	import EmptyState from "#lib/components/empty-state.svelte";
	import Fab from "#lib/components/fab.svelte";
	import HousePlan from "#lib/components/house/house-plan.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import {
		freePlanSpot,
		houseGroups,
		planBaseFloor,
		planSvg,
		type RoomPlan,
	} from "#lib/house.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { savePlan } from "#lib/remote/house.remote.js";
	import { roomIcon } from "#lib/room-icons.js";
	import { useSheets } from "#lib/sheets.svelte.js";
	import { toastError } from "#lib/toast.js";

	const { data } = $props();

	const sheets = useSheets();
	let editing = $state(false);
	let saving = $state<
		| { state: "saving" }
		| { state: "saved"; at: Date }
		| { state: "failed"; reason: string }
		| null
	>(null);
	let groupId = $state("");
	let shapes = $state<Record<string, RoomPlan[] | null>>({});
	let moves = $state<Record<string, string | null>>({});
	let pins = $state<
		Record<string, { place: string; x: number; y: number } | null>
	>({});
	let baseDraft = $state<string | undefined>();

	const dirty = $derived(
		Object.keys(shapes).length > 0 ||
			Object.keys(moves).length > 0 ||
			Object.keys(pins).length > 0 ||
			baseDraft !== undefined,
	);
	const rooms = $derived(
		data.rooms.map((room) =>
			room.id in shapes ? { ...room, plan: shapes[room.id] ?? null } : room,
		),
	);
	const devices = $derived(
		data.devices.map((device) => ({
			...device,
			roomId: device.id in moves ? (moves[device.id] ?? null) : device.roomId,
			pin: device.id in pins ? (pins[device.id] ?? null) : device.pin,
		})),
	);
	const groups = $derived(houseGroups(data.floors, rooms));
	const group = $derived(
		groups.find((entry) => entry.id === groupId) ?? groups[0],
	);
	const groupRooms = $derived(
		rooms.filter((room) => group?.rooms.some((entry) => entry.id === room.id)),
	);
	const groupDevices = $derived(
		devices.filter(
			(device) =>
				device.roomId === null ||
				groupRooms.some((room) => room.id === device.roomId),
		),
	);

	const base = $derived(
		planBaseFloor(data.floors, baseDraft ?? data.home.planBaseFloorId),
	);
	const outline = $derived(
		group
			? rooms.flatMap((room) => {
					const inGroup = group.rooms.some((entry) => entry.id === room.id);
					const onBase =
						group.id !== base?.id && !room.outdoor && room.floorId === base?.id;
					const otherStairs = room.icon === "stairs" && !inGroup;
					return room.plan && !inGroup && (onBase || otherStairs)
						? [{ id: room.id, icon: room.icon, plan: room.plan }]
						: [];
				})
			: [],
	);
	let exporting = $state(false);
	const drawing = $derived(
		group
			? planSvg({
					title: `${group.name}, ${data.home.name}`,
					rooms: groupRooms.flatMap((room) =>
						room.plan
							? [{ id: room.id, name: room.name, plan: room.plan }]
							: [],
					),
					outline: outline.map((base) => base.plan),
					devices: groupDevices.map((device) => ({
						name: device.name,
						roomId: device.roomId,
						pin: device.pin?.place === group.id ? device.pin : null,
					})),
				})
			: null,
	);
	const fileName = $derived(
		`${(group?.name ?? "plan").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-plan`,
	);

	function download(blob: Blob, name: string) {
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = name;
		link.click();
		URL.revokeObjectURL(url);
	}

	function exportSvg() {
		if (drawing) {
			download(
				new Blob([drawing.svg], { type: "image/svg+xml" }),
				`${fileName}.svg`,
			);
			exporting = false;
		}
	}

	async function pngCallback() {
		if (!drawing) {
			return;
		}
		const image = new Image();
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.svg)}`;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = drawing.width * 2;
		canvas.height = drawing.height * 2;
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("This browser can't draw the image.");
		}
		context.scale(2, 2);
		context.drawImage(image, 0, 0);
		const blob = await new Promise<Blob | null>((done) =>
			canvas.toBlob(done, "image/png"),
		);
		if (!blob) {
			throw new Error("This browser can't make the image.");
		}
		download(blob, `${fileName}.png`);
		exporting = false;
	}

	function handlePng() {
		toast.promise(pngCallback(), {
			loading: "Drawing the plan",
			success: "Plan exported.",
			error: (failure) => toastError(failure),
		});
	}

	const isFloor = $derived(data.floors.some((floor) => floor.id === group?.id));

	setPageTitle("Plan", undefined, () => {
		const exportAction = group
			? [
					{
						label: "Export the plan",
						icon: DownloadIcon,
						onSelect: () => (exporting = true),
					},
				]
			: [];
		if (!data.isAdmin) {
			return exportAction;
		}
		return [
			...exportAction,
			{
				label: editing ? "Done" : "Edit the plan",
				icon: editing ? CheckIcon : PencilRulerIcon,
				onSelect: handleEditing,
				primary: true,
			},
			...(editing && dirty
				? [{ label: "Discard changes", icon: UndoIcon, onSelect: discard }]
				: []),
			{
				label: "Add a room",
				icon: PlusIcon,
				onSelect: () => (sheets.room = { id: null, place: group?.id }),
			},
		];
	});

	beforeNavigate(({ cancel, type }) => {
		if (!dirty) {
			return;
		}
		if (
			type === "leave" ||
			!window.confirm("Leave the plan without saving your changes?")
		) {
			cancel();
		}
	});

	function discard() {
		shapes = {};
		moves = {};
		pins = {};
		baseDraft = undefined;
		saving = null;
	}

	async function saveCallback() {
		await savePlan({
			rooms: Object.entries(shapes).map(([roomId, plan]) => ({
				roomId,
				plan,
			})),
			moves: Object.entries(moves).map(([deviceId, roomId]) => ({
				deviceId,
				roomId: roomId ?? "house",
			})),
			pins: Object.entries(pins).map(([deviceId, pin]) => ({ deviceId, pin })),
			baseFloorId: baseDraft,
		});
		await invalidateAll();
	}

	async function handleEditing() {
		if (!editing) {
			editing = true;
			saving = null;
			return;
		}
		if (!dirty) {
			editing = false;
			return;
		}
		saving = { state: "saving" };
		try {
			await saveCallback();
			discard();
			saving = { state: "saved", at: new Date() };
			editing = false;
		} catch (failure) {
			saving = { state: "failed", reason: toastError(failure) };
		}
	}

	function handlePlace(room: { id: string }, onPlan: boolean) {
		const taken = groupRooms.flatMap((entry) => entry.plan ?? []);
		shapes[room.id] = onPlan ? [freePlanSpot(taken)] : null;
	}

	function handleAddPart(room: { id: string; plan: RoomPlan[] | null }) {
		const taken = groupRooms.flatMap((entry) => entry.plan ?? []);
		shapes[room.id] = [...(room.plan ?? []), freePlanSpot(taken, 3, 3)];
	}

	function handleBase(floor: { id: string }) {
		baseDraft = floor.id;
	}
</script>

{#if !group}
	<div class="glass mx-auto mt-6 max-w-xl rounded-3xl">
		<EmptyState
			icon={MapIcon}
			title="No rooms to draw yet"
			subtitle={data.isAdmin
				? "Add the rooms of the house, then draw them on the plan."
				: "Ask an admin to add the rooms of the house."}
		>
			{#if data.isAdmin}
				<Button
					size="lg"
					class="h-11 rounded-xl px-6"
					onclick={() => (sheets.room = { id: null })}
				>
					<PlusIcon />
					Add a room
				</Button>
			{/if}
		</EmptyState>
	</div>
{:else}
	<div class="flex flex-col gap-4">
		{#if editing || saving?.state === "saved"}
			<p
				class="text-sm {saving?.state === 'failed'
					? 'text-destructive'
					: 'text-muted-foreground'}"
				aria-live="polite"
			>
				{#if saving?.state === "saving"}
					Saving…
				{:else if saving?.state === "failed"}
					Couldn't save: {saving.reason}
				{:else if dirty}
					Unsaved changes: Done saves them.
				{:else if saving?.state === "saved"}
					Saved at {saving.at.toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					})}
				{:else}
					Nothing changed yet.
				{/if}
			</p>
		{/if}
		{#if groups.length > 7}
			<Picker
				id="plan-floor"
				name="floor"
				label="Floor"
				options={groups.map((entry) => ({
					value: entry.id,
					label: entry.name,
				}))}
				value={group.id}
				onPick={(next) => (groupId = next)}
			/>
		{:else if groups.length > 1}
			<ToggleGroup.Root
				type="single"
				value={group.id}
				spacing={2}
				aria-label="Floor"
				class="w-full flex-wrap justify-start"
				onValueChange={(next) => {
					if (next) {
						groupId = next;
					}
				}}
			>
				{#each groups as entry (entry.id)}
					<ToggleGroup.Item
						value={entry.id}
						class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 rounded-xl px-4"
						>{entry.name}</ToggleGroup.Item
					>
				{/each}
			</ToggleGroup.Root>
		{/if}

		{#if !editing && groupRooms.every((room) => room.plan === null)}
			<p class="text-muted-foreground text-sm">
				{data.isAdmin
					? "Nothing drawn on this floor yet: Edit the plan to place its rooms."
					: "Nothing drawn on this floor yet."}
			</p>
		{/if}

		<HousePlan
			rooms={groupRooms}
			devices={groupDevices}
			{editing}
			{outline}
			onShape={(roomId, plan) => (shapes[roomId] = plan)}
			onMove={(deviceId, roomId) => (moves[deviceId] = roomId)}
			onPin={(deviceId, pin) => (pins[deviceId] = pin)}
			place={group.id}
		>
			{#snippet aside()}
				{#if editing}
					{#if isFloor}
						<div
							class="glass flex min-h-14 items-center gap-3 rounded-xl px-3 py-2"
						>
							<p class="min-w-0 flex-1 text-sm">
								{group.id === base?.id
									? "The base of the house: the other floors and outside show its outline."
									: `Drawn over ${base?.name ?? "the base floor"}'s outline.`}
							</p>
							{#if group.id !== base?.id}
								<Button
									variant="secondary"
									class="h-11 rounded-xl"
									onclick={() => handleBase(group)}>Make it the base</Button
								>
							{/if}
						</div>
					{:else if base}
						<p class="text-muted-foreground text-sm">
							Drawn over {base.name}'s outline.
						</p>
					{/if}
					<p class="text-muted-foreground text-sm">
						Right-click a room, or long-press it on a phone, to extend it, split
						it or remove a part.
					</p>
					<ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
						{#each groupRooms as room (room.id)}
							{@const Icon = roomIcon(room.icon)}
							{@const onPlan = room.plan !== null}
							<li
								class="glass flex min-h-14 items-center gap-3 rounded-xl px-3"
							>
								<Icon class="text-muted-foreground size-5 shrink-0" />
								<span class="min-w-0 flex-1 truncate font-medium"
									>{room.name}</span
								>
								{#if onPlan && (room.plan?.length ?? 0) < 12}
									<IconButton
										label="Add a part to {room.name}"
										icon={SquarePlusIcon}
										variant="ghost"
										onclick={() => handleAddPart(room)}
									/>
								{/if}
								<Button
									variant={onPlan ? "ghost" : "secondary"}
									class="h-11 rounded-xl"
									onclick={() => handlePlace(room, !onPlan)}
									>{onPlan ? "Take off" : "Place"}</Button
								>
							</li>
						{/each}
					</ul>
				{/if}
			{/snippet}
		</HousePlan>
	</div>
{/if}

<ResponsiveSheet
	bind:open={exporting}
	wide
	title="Export the plan"
	description="{group?.name ??
		'This floor'} as drawn, with its rooms, devices and the base floor's outline."
>
	<div class="flex flex-col gap-3 pb-6">
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<Button class="h-11 rounded-xl" onclick={handlePng}
				><ImageIcon />PNG image</Button
			>
			<Button variant="secondary" class="h-11 rounded-xl" onclick={exportSvg}
				><FileCodeIcon />SVG drawing</Button
			>
			{#if data.isAdmin}
				<Button
					variant="secondary"
					class="h-11 rounded-xl"
					href={resolve("/(protected)/admin/configuration/export")}
					download><FileJsonIcon />LocalAssistant file</Button
				>
			{/if}
		</div>
		{#if data.isAdmin}
			<p class="text-muted-foreground text-sm">
				The LocalAssistant file holds the whole house: floors, rooms with their
				plan, devices with their pins. Import it in Admin, Configuration on any
				instance.
			</p>
		{/if}
	</div>
</ResponsiveSheet>

{#if data.isAdmin && group}
	<Fab
		label={editing ? "Done" : "Edit the plan"}
		icon={editing ? CheckIcon : PencilRulerIcon}
		onclick={handleEditing}
	/>
{/if}
