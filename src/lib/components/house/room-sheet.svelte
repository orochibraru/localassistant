<script lang="ts">
	import { enhance } from "$app/forms";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import CheckIcon from "@lucide/svelte/icons/check";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import {
		guessRoomIcon,
		type HouseFloor,
		type HouseRoom,
		noFloorPlace,
		outsidePlace,
		placeOf,
		roomIconLabels,
		roomIcons,
	} from "#lib/house.js";
	import { roomIcon } from "#lib/room-icons.js";
	import { useSheets } from "#lib/sheets.svelte.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Props {
		rooms: HouseRoom[];
		floors: HouseFloor[];
	}

	const { rooms, floors }: Props = $props();

	const sheets = useSheets();
	const housePath = resolve("/(protected)/house");

	let errors = $state<Record<string, string[]>>({});
	let confirmingRemove = $state(false);
	let icon = $state<string>("door");
	let iconPicked = $state(false);

	const editing = $derived(
		sheets.room?.id
			? rooms.find((room) => room.id === sheets.room?.id)
			: undefined,
	);
	const placeOptions = $derived([
		...(floors.length > 0
			? floors.map((floor) => ({ value: floor.id, label: floor.name }))
			: [{ value: noFloorPlace, label: "Inside" }]),
		{ value: outsidePlace, label: "Outside" },
	]);
	const groundFloor = $derived(
		floors.toSorted(
			(first, second) =>
				Math.abs(first.level) - Math.abs(second.level) ||
				first.level - second.level,
		)[0],
	);
	const place = $derived(
		editing
			? placeOf(editing)
			: (sheets.room?.place ?? groundFloor?.id ?? noFloorPlace),
	);

	const open = {
		get open() {
			return sheets.room !== null;
		},
		set open(value: boolean) {
			if (!value) {
				sheets.room = null;
			}
		},
	};

	$effect.pre(() => {
		if (sheets.room) {
			icon = editing?.icon ?? "door";
			iconPicked = editing !== undefined;
			errors = {};
			confirmingRemove = false;
		}
	});

	const errorsOf = (name: string) =>
		errors[name]?.map((message) => ({ message }));

	function failed(result: Record<string, unknown> | undefined) {
		errors = (result?.errors as Record<string, string[]>) ?? {};
	}

	async function leaveRemovedRoom(roomId: string) {
		open.open = false;
		if (page.url.pathname.endsWith(`/rooms/${roomId}`)) {
			await goto(housePath);
		}
	}
</script>

<ResponsiveSheet
	bind:open={open.open}
	title={editing ? `${editing.name} settings` : "Add a room"}
	wide
>
	{#if sheets.room}
		<form
			method="POST"
			action="{housePath}?/{editing ? 'editRoom' : 'addRoom'}"
			class="flex flex-col gap-4"
			use:enhance={enhanceToast({
				loading: editing ? "Saving the room" : "Adding the room",
				success: editing ? "Room saved." : "Room added.",
				onFailure: failed,
				onSuccess: () => {
					open.open = false;
				},
			})}
		>
			{#if editing}
				<input type="hidden" name="id" value={editing.id} />
			{/if}
			<Field.Field>
				<Field.Label for="room-name">Name</Field.Label>
				<Input
					id="room-name"
					name="name"
					value={editing?.name ?? ""}
					placeholder="Living room"
					required
					class="h-11"
					oninput={(event) => {
						if (!iconPicked) {
							icon = guessRoomIcon(event.currentTarget.value) ?? "door";
						}
					}}
				/>
				<Field.Error errors={errorsOf("name")} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="room-place">Where</Field.Label>
				<Picker
					id="room-place"
					name="place"
					label="Where"
					options={placeOptions}
					value={place}
				/>
				<Field.Error errors={errorsOf("place")} />
			</Field.Field>
			<Field.Field>
				<Field.Label>Icon</Field.Label>
				<input type="hidden" name="icon" value={icon} />
				<ToggleGroup.Root
					type="single"
					bind:value={icon}
					spacing={2}
					aria-label="Room icon"
					class="grid w-full grid-cols-5 sm:grid-cols-7"
					onValueChange={(next) => {
						icon = next || icon;
						iconPicked = true;
					}}
				>
					{#each roomIcons as key (key)}
						{@const Icon = roomIcon(key)}
						<ToggleGroup.Item
							value={key}
							aria-label={roomIconLabels[key]}
							title={roomIconLabels[key]}
							class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 w-full rounded-xl"
						>
							<Icon class="size-5" />
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
				<Field.Description
					>{roomIconLabels[icon as keyof typeof roomIconLabels] ??
						""}</Field.Description
				>
			</Field.Field>
			<Button type="submit" class="h-11 rounded-xl px-5">
				{#if editing}<CheckIcon />Save{:else}<PlusIcon />Add room{/if}
			</Button>
		</form>
		{#if editing}
			<div class="border-border mt-6 border-t pt-4 pb-6">
				{#if confirmingRemove}
					<form
						method="POST"
						action="{housePath}?/removeRoom"
						class="flex flex-col gap-3"
						use:enhance={enhanceToast({
							loading: "Deleting the room",
							success: `${editing.name} deleted.`,
							onSuccess: () => leaveRemovedRoom(editing.id),
						})}
					>
						<input type="hidden" name="id" value={editing.id} />
						<p class="text-sm">Its devices move to the whole house.</p>
						<div class="flex gap-3">
							<Button
								type="submit"
								variant="destructive"
								class="h-11 flex-1 rounded-xl"
								><Trash2Icon />Delete {editing.name}</Button
							>
							<Button
								variant="secondary"
								class="h-11 rounded-xl px-5"
								onclick={() => (confirmingRemove = false)}>Keep it</Button
							>
						</div>
					</form>
				{:else}
					<Button
						variant="ghost"
						class="text-destructive h-11 rounded-xl px-5"
						onclick={() => (confirmingRemove = true)}
						><Trash2Icon />Delete this room</Button
					>
				{/if}
			</div>
		{:else}
			<div class="pb-6"></div>
		{/if}
	{/if}
</ResponsiveSheet>
