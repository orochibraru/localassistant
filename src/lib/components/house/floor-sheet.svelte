<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import type { HouseFloor } from "#lib/house.js";
	import { useSheets } from "#lib/sheets.svelte.js";
	import { enhanceToast } from "#lib/toast.js";

	const { floors }: { floors: HouseFloor[] } = $props();

	const sheets = useSheets();
	const housePath = resolve("/(protected)/house");

	let errors = $state<Record<string, string[]>>({});
	let confirmingRemove = $state(false);

	const editing = $derived(
		sheets.floor?.id
			? floors.find((floor) => floor.id === sheets.floor?.id)
			: undefined,
	);
	const nextLevel = $derived(
		floors.length > 0 ? Math.max(...floors.map((floor) => floor.level)) + 1 : 0,
	);

	const open = {
		get open() {
			return sheets.floor !== null;
		},
		set open(value: boolean) {
			if (!value) {
				sheets.floor = null;
			}
			errors = {};
			confirmingRemove = false;
		},
	};

	const errorsOf = (name: string) =>
		errors[name]?.map((message) => ({ message }));

	function failed(result: Record<string, unknown> | undefined) {
		errors = (result?.errors as Record<string, string[]>) ?? {};
	}
</script>

<ResponsiveSheet
	bind:open={open.open}
	title={editing ? `${editing.name} settings` : "Add a floor"}
>
	{#if sheets.floor}
		<form
			method="POST"
			action="{housePath}?/{editing ? 'editFloor' : 'addFloor'}"
			class="flex flex-col gap-4"
			use:enhance={enhanceToast({
				loading: editing ? "Saving the floor" : "Adding the floor",
				success: editing ? "Floor saved." : "Floor added.",
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
				<Field.Label for="floor-name">Name</Field.Label>
				<Input
					id="floor-name"
					name="name"
					value={editing?.name ?? ""}
					placeholder={nextLevel === 0 ? "Ground floor" : "First floor"}
					required
					class="h-11"
				/>
				<Field.Error errors={errorsOf("name")} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="floor-level">Level</Field.Label>
				<Input
					id="floor-level"
					name="level"
					type="number"
					inputmode="numeric"
					value={editing?.level ?? nextLevel}
					required
					class="h-11"
				/>
				<Field.Description
					>0 is the ground floor, 1 the floor above, -1 the basement. Floors are
					listed from the lowest.</Field.Description
				>
				<Field.Error errors={errorsOf("level")} />
			</Field.Field>
			<Button type="submit" class="h-11 rounded-xl px-5">
				{#if editing}<CheckIcon />Save{:else}<PlusIcon />Add floor{/if}
			</Button>
		</form>
		{#if editing}
			<div class="border-border mt-6 border-t pt-4 pb-6">
				{#if confirmingRemove}
					<form
						method="POST"
						action="{housePath}?/removeFloor"
						class="flex flex-col gap-3"
						use:enhance={enhanceToast({
							loading: "Deleting the floor",
							success: `${editing.name} deleted.`,
							onSuccess: () => {
								open.open = false;
							},
						})}
					>
						<input type="hidden" name="id" value={editing.id} />
						<p class="text-sm">
							{floors.length > 1
								? "Its rooms move to the nearest floor."
								: "Its rooms stay, without a floor."}
						</p>
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
						><Trash2Icon />Delete this floor</Button
					>
				{/if}
			</div>
		{:else}
			<div class="pb-6"></div>
		{/if}
	{/if}
</ResponsiveSheet>
