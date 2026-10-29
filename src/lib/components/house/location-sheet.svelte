<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import MapPinIcon from "@lucide/svelte/icons/map-pin";

	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { searchPlaces } from "#lib/remote/places.remote.js";
	import { enhanceToast, toastError } from "#lib/toast.js";

	interface Props {
		open: boolean;
		home: { id: string; name: string } | undefined;
	}

	let { open = $bindable(), home }: Props = $props();

	const homesPath = resolve("/(protected)/admin/homes");

	let placeQuery = $state("");
	let places = $state<Awaited<ReturnType<typeof searchPlaces>>>([]);
	let searchError = $state<string | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (open) {
			placeQuery = "";
			places = [];
			searchError = null;
		}
	});

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
</script>

<ResponsiveSheet
	bind:open
	title="Where is {home?.name ?? ''}?"
	description="For the weather and the sunrise and sunset routines. Only the coordinates leave the server, to Open-Meteo."
>
	{#if home}
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
							action="{homesPath}?/locate"
							use:enhance={enhanceToast({
								loading: "Saving the location",
								success: `${home.name} is in ${place.place}.`,
								onSuccess: () => {
									open = false;
								},
							})}
						>
							<input type="hidden" name="id" value={home.id} />
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
