<script lang="ts">
	import { enhance } from "$app/forms";
	import CheckIcon from "@lucide/svelte/icons/check";
	import MapPinIcon from "@lucide/svelte/icons/map-pin";
	import MapPinOffIcon from "@lucide/svelte/icons/map-pin-off";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import LocationSheet from "#lib/components/house/location-sheet.svelte";
	import ItemMenu from "#lib/components/item-menu.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import SettingSwitch from "#lib/components/setting-switch.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast, saveToast } from "#lib/toast.js";

	const { data } = $props();

	let renaming = $state<{ id: string; name: string } | undefined>();
	let renameOpen = $state(false);
	let errors = $state<Record<string, string[]>>({});
	let locating = $state<{ id: string; name: string } | undefined>();
	let locateOpen = $state(false);
	const errorsOf = (name: string) =>
		errors[name]?.map((message) => ({ message }));
</script>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
	<form
		method="POST"
		action="?/multiple"
		class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6"
		use:enhance={saveToast("Homes")}
	>
		<SettingSwitch
			name="multipleHomes"
			label="Several homes"
			description="For a second house, a flat or a holiday home: each has its own floors, rooms and devices, and everyone picks which one they're looking at."
			checked={data.multipleHomes}
		/>
		<Button type="submit" class="h-11 self-start rounded-xl px-5"
			><CheckIcon />Save</Button
		>
	</form>

	<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
		<div>
			<h2 class="font-semibold">Homes</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Deleting a home deletes its floors, rooms and devices.
			</p>
		</div>
		<ul class="divide-border -mx-2 divide-y">
			{#each data.allHomes as home (home.id)}
				<li>
					<ItemMenu
						title={home.name}
						class="min-h-12 px-2"
						actions={[
							{
								label: "Set location",
								icon: MapPinIcon,
								onSelect: () => {
									locating = home;
									locateOpen = true;
								},
							},
							...(home.place
								? [
										{
											label: "Clear the location",
											icon: MapPinOffIcon,
											form: {
												action: "?/unlocate",
												fields: { id: home.id },
												loading: "Clearing the location",
												success: `${home.name} has no location now.`,
											},
										},
									]
								: []),
							{
								label: "Rename",
								icon: PencilIcon,
								onSelect: () => {
									renaming = home;
									errors = {};
									renameOpen = true;
								},
							},
							...(data.allHomes.length > 1
								? [
										{
											label: "Delete",
											icon: Trash2Icon,
											destructive: true,
											form: {
												action: "?/remove",
												fields: { id: home.id },
												loading: "Deleting the home",
												success: `${home.name} deleted.`,
												confirm: {
													title: `Delete ${home.name}?`,
													description:
														"Its floors, rooms and devices go with it, for everyone.",
													confirmLabel: "Delete",
												},
											},
										},
									]
								: []),
						]}
					>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium">{home.name}</span>
							<span class="text-muted-foreground block truncate text-sm"
								>{home.place ??
									"No location: weather from your browser, no sun times"}</span
							>
						</span>
					</ItemMenu>
				</li>
			{/each}
		</ul>
		{#if data.multipleHomes}
			<form
				method="POST"
				action="?/add"
				class="flex flex-col gap-3 sm:flex-row sm:items-start"
				use:enhance={enhanceToast({
					loading: "Adding the home",
					success: "Home added.",
					reset: true,
					onFailure: (result) =>
						(errors = (result?.errors as Record<string, string[]>) ?? {}),
					onSuccess: () => {
						errors = {};
					},
				})}
			>
				<Field.Field class="flex-1">
					<Field.Label for="home-name" class="sr-only">Home name</Field.Label>
					<Input
						id="home-name"
						name="name"
						placeholder="Holiday home"
						required
						class="h-11"
					/>
					<Field.Error errors={errorsOf("name")} />
				</Field.Field>
				<Button type="submit" class="h-11 rounded-xl px-5"
					><PlusIcon />Add a home</Button
				>
			</form>
		{/if}
	</section>
</div>

<ResponsiveSheet bind:open={renameOpen} title="Rename {renaming?.name ?? ''}">
	{#if renaming}
		<form
			method="POST"
			action="?/rename"
			class="flex flex-col gap-4 pb-6"
			use:enhance={enhanceToast({
				loading: "Renaming",
				success: "Renamed.",
				onFailure: (result) =>
					(errors = (result?.errors as Record<string, string[]>) ?? {}),
				onSuccess: () => {
					renameOpen = false;
				},
			})}
		>
			<input type="hidden" name="id" value={renaming.id} />
			<Field.Field>
				<Field.Label for="rename-home">Name</Field.Label>
				<Input
					id="rename-home"
					name="name"
					value={renaming.name}
					required
					class="h-11"
				/>
				<Field.Error errors={errorsOf("name")} />
			</Field.Field>
			<Button type="submit" class="h-11 rounded-xl px-5"
				><CheckIcon />Save</Button
			>
		</form>
	{/if}
</ResponsiveSheet>

<LocationSheet bind:open={locateOpen} home={locating} />
