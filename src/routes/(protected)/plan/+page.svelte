<script lang="ts">
	import { beforeNavigate, invalidateAll } from "$app/navigation";
	import CheckIcon from "@lucide/svelte/icons/check";
	import MapIcon from "@lucide/svelte/icons/map";
	import PencilRulerIcon from "@lucide/svelte/icons/pencil-ruler";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SquarePlusIcon from "@lucide/svelte/icons/square-plus";
	import UndoIcon from "@lucide/svelte/icons/undo-2";

	import EmptyState from "#lib/components/empty-state.svelte";
	import Fab from "#lib/components/fab.svelte";
	import HousePlan from "#lib/components/house/house-plan.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import Picker from "#lib/components/picker.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import {
		freePlanSpot,
		houseGroups,
		planBaseFloor,
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
	const isFloor = $derived(data.floors.some((floor) => floor.id === group?.id));

	setPageTitle("Plan", undefined, () => {
		if (!data.isAdmin) {
			return [];
		}
		return [
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
					<ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
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

{#if data.isAdmin && group}
	<Fab
		label={editing ? "Done" : "Edit the plan"}
		icon={editing ? CheckIcon : PencilRulerIcon}
		onclick={handleEditing}
	/>
{/if}
