<script lang="ts">
	import { enhance } from "$app/forms";
	import CheckIcon from "@lucide/svelte/icons/check";
	import MapPinIcon from "@lucide/svelte/icons/map-pin";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import ItemMenu from "#lib/components/item-menu.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import SettingSwitch from "#lib/components/setting-switch.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { searchPlaces } from "#lib/remote/places.remote.js";
	import { enhanceToast, saveToast, toastError } from "#lib/toast.js";

	const { data } = $props();

	let renaming = $state<{ id: string; name: string } | undefined>();
	let renameOpen = $state(false);
	let errors = $state<Record<string, string[]>>({});
	let locating = $state<{ id: string; name: string } | undefined>();
	let locateOpen = $state(false);
	let placeQuery = $state("");
	let places = $state<Awaited<ReturnType<typeof searchPlaces>>>([]);
	let searchError = $state<string | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function searchSoon(text: string) {
		clearTimeout(searchTimer);
		searchError = null;
		if (text.trim().length < 2) {
			places = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			try {
				places = await searchPlaces(text.trim());
			} catch (failure) {
				searchError = toastError(failure);
			}
		}, 350);
	}

	const errorsOf = (name: string) =>
		errors[name]?.map((message) => ({ message }));
</script>

<div class="grid gap-6 lg:grid-cols-2 lg:items-start">
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
									placeQuery = "";
									places = [];
									locateOpen = true;
								},
							},
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
								>{home.place ?? "No location: no weather or sun times"}</span
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

<ResponsiveSheet
	bind:open={locateOpen}
	title="Where is {locating?.name ?? ''}?"
	description="For the weather on Home and the sunrise and sunset automations. Only the coordinates leave the server, to Open-Meteo."
>
	{#if locating}
		<div class="flex flex-col gap-4 pb-6">
			<Field.Field>
				<Field.Label for="place-search">Town or city</Field.Label>
				<Input
					id="place-search"
					bind:value={placeQuery}
					oninput={() => searchSoon(placeQuery)}
					placeholder="Clermont-Ferrand"
					autocomplete="off"
					class="h-11"
				/>
				{#if searchError}
					<Field.Error errors={[{ message: searchError }]} />
				{/if}
			</Field.Field>
			<ul class="flex flex-col gap-2">
				{#each places as place (`${place.latitude},${place.longitude}`)}
					<li>
						<form
							method="POST"
							action="?/locate"
							use:enhance={enhanceToast({
								loading: "Saving the location",
								success: `${locating.name} is in ${place.place}.`,
								onSuccess: () => {
									locateOpen = false;
								},
							})}
						>
							<input type="hidden" name="id" value={locating.id} />
							<input type="hidden" name="place" value={place.place} />
							<input type="hidden" name="latitude" value={place.latitude} />
							<input type="hidden" name="longitude" value={place.longitude} />
							<input type="hidden" name="timezone" value={place.timezone} />
							<Button
								type="submit"
								variant="secondary"
								class="h-auto min-h-11 w-full justify-start rounded-xl px-4 py-2 text-left whitespace-normal"
								><MapPinIcon />{place.place}</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</ResponsiveSheet>
