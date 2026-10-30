<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import LocateFixedIcon from "@lucide/svelte/icons/locate-fixed";
	import MapPinIcon from "@lucide/svelte/icons/map-pin";

	import { currentLocation } from "#lib/app-device.js";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { searchPlaces } from "#lib/remote/places.remote.js";
	import { enhanceToast, toastError } from "#lib/toast.js";
	import { cn } from "#lib/utils.js";

	interface Props {
		open: boolean;
		home: { id: string; name: string } | undefined;
	}

	interface Place {
		place: string;
		latitude: number;
		longitude: number;
		timezone: string;
	}

	let { open = $bindable(), home }: Props = $props();

	const homesPath = resolve("/(protected)/admin/homes");

	let placeQuery = $state("");
	let places = $state<Place[]>([]);
	let chosen = $state<Place | null>(null);
	let searching = $state(false);
	let locating = $state(false);
	let searchError = $state<string | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let latestSearch = 0;

	const status = $derived(
		searchError ??
			(searching
				? null
				: placeQuery.trim().length < 2
					? "Type at least two letters, or use this device's location."
					: places.length === 0
						? "No place found by that name."
						: null),
	);

	$effect(() => {
		if (open) {
			placeQuery = "";
			places = [];
			chosen = null;
			searchError = null;
		}
	});

	function searchSoon(text: string) {
		clearTimeout(searchTimer);
		searchError = null;
		if (text.trim().length < 2) {
			places = [];
			searching = false;
			return;
		}
		searching = true;
		searchTimer = setTimeout(async () => {
			const search = ++latestSearch;
			try {
				const found = await searchPlaces(text.trim());
				if (search === latestSearch) {
					places = found;
					chosen = found.length === 1 ? (found[0] ?? null) : chosen;
				}
			} catch (failure) {
				searchError = toastError(failure);
			} finally {
				if (search === latestSearch) {
					searching = false;
				}
			}
		}, 300);
	}

	function choose(place: Place) {
		chosen = place;
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
	}

	async function locateCallback() {
		locating = true;
		try {
			const here = await currentLocation();
			if (!here) {
				throw new Error(
					"Location is blocked or unavailable here. Search for the town instead.",
				);
			}
			choose({
				place: "This device's location",
				latitude: Math.round(here.latitude * 1000) / 1000,
				longitude: Math.round(here.longitude * 1000) / 1000,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			});
		} finally {
			locating = false;
		}
	}

	function handleLocate() {
		locateCallback().catch((failure: unknown) => {
			searchError = toastError(failure);
		});
	}
</script>

<ResponsiveSheet
	bind:open
	title="Where is {home?.name ?? ''}?"
	description="For the weather and the sunrise and sunset routines. Only the coordinates leave the server, to Open-Meteo."
>
	{#if home}
		<form
			method="POST"
			id="location-form"
			action="{homesPath}?/locate"
			class="flex flex-col gap-4 pb-4"
			use:enhance={enhanceToast({
				loading: "Saving the location",
				success: () =>
					`${home.name} is in ${chosen?.place ?? "its new place"}.`,
				onSuccess: () => {
					open = false;
				},
			})}
		>
			<Field.Field>
				<Field.Label for="place-search">Town or city</Field.Label>
				<Input
					id="place-search"
					type="search"
					enterkeyhint="search"
					bind:value={placeQuery}
					oninput={() => searchSoon(placeQuery)}
					onkeydown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							const first = places[0];
							if (first) {
								choose(first);
							}
						}
					}}
					placeholder="Clermont-Ferrand"
					autocomplete="off"
					class="h-11"
				/>
				{#if searching}
					<Field.Description class="flex items-center gap-2"
						><Spinner class="size-4" />Searching</Field.Description
					>
				{:else if searchError}
					<Field.Error errors={[{ message: searchError }]} />
				{:else if status}
					<Field.Description>{status}</Field.Description>
				{/if}
			</Field.Field>
			{#if places.length > 0}
				<ul class="flex flex-col gap-2" aria-label="Places found">
					{#each places as place (`${place.latitude},${place.longitude}`)}
						{@const selected =
							chosen?.latitude === place.latitude &&
							chosen.longitude === place.longitude}
						<li>
							<button
								type="button"
								aria-pressed={selected}
								class={cn(
									"flex min-h-11 w-full items-center gap-3 rounded-xl border px-4 py-2 text-left text-sm transition-colors",
									selected
										? "border-primary bg-primary/10"
										: "bg-secondary hover:bg-accent border-transparent",
								)}
								onclick={() => choose(place)}
							>
								<MapPinIcon class="text-muted-foreground size-4 shrink-0" />
								<span class="flex-1">{place.place}</span>
								{#if selected}<CheckIcon class="text-primary size-4" />{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<Button
				type="button"
				variant="outline"
				class="h-11 rounded-xl"
				disabled={locating}
				onclick={handleLocate}
			>
				{#if locating}<Spinner />{:else}<LocateFixedIcon />{/if}
				Use this device's location
			</Button>
			<input type="hidden" name="id" value={home.id} />
			{#if chosen}
				<input type="hidden" name="place" value={chosen.place} />
				<input type="hidden" name="latitude" value={chosen.latitude} />
				<input type="hidden" name="longitude" value={chosen.longitude} />
				<input type="hidden" name="timezone" value={chosen.timezone} />
			{/if}
		</form>
	{/if}
	{#snippet footer()}
		{#if chosen}
			<p class="text-muted-foreground text-sm">
				{chosen.place} · {chosen.latitude.toFixed(3)}, {chosen.longitude.toFixed(
					3,
				)}
			</p>
		{/if}
		<Button
			type="submit"
			form="location-form"
			class="h-11 rounded-xl"
			disabled={!chosen}><CheckIcon />Save the location</Button
		>
	{/snippet}
</ResponsiveSheet>
