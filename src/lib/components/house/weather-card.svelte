<script lang="ts">
	import CloudIcon from "@lucide/svelte/icons/cloud";
	import CloudDrizzleIcon from "@lucide/svelte/icons/cloud-drizzle";
	import CloudFogIcon from "@lucide/svelte/icons/cloud-fog";
	import CloudLightningIcon from "@lucide/svelte/icons/cloud-lightning";
	import CloudMoonIcon from "@lucide/svelte/icons/cloud-moon";
	import CloudRainIcon from "@lucide/svelte/icons/cloud-rain";
	import CloudSnowIcon from "@lucide/svelte/icons/cloud-snow";
	import CloudSunIcon from "@lucide/svelte/icons/cloud-sun";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import SunIcon from "@lucide/svelte/icons/sun";
	import SunriseIcon from "@lucide/svelte/icons/sunrise";
	import SunsetIcon from "@lucide/svelte/icons/sunset";
	import { type Component, onMount } from "svelte";

	import { currentLocation } from "#lib/app-device.js";
	import LocationSheet from "#lib/components/house/location-sheet.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { weatherHere } from "#lib/remote/places.remote.js";
	import { toastError } from "#lib/toast.js";
	import {
		clockTime,
		describeWeather,
		type Weather,
		type WeatherKind,
	} from "#lib/weather.js";

	interface Props {
		home: {
			id: string;
			name: string;
			place: string | null;
			timezone: string | null;
			weather: Weather | null;
		};
		isAdmin: boolean;
	}

	const { home, isAdmin }: Props = $props();

	const place = $derived(home.place);
	const timezone = $derived(home.timezone);
	const saved = $derived(home.weather);

	let locating = $state(false);

	const hereRefreshMs = 10 * 60 * 1000;

	let clock = $state(new Date());
	let here = $state<Weather | null>(null);
	let hereStatus = $state<"asking" | "blocked" | "failed" | null>(null);
	let hereError = $state("");

	async function readHere() {
		if (place) {
			return;
		}
		const location = await currentLocation();
		if (!location) {
			hereStatus = location === null ? "blocked" : "failed";
			hereError = "Couldn't find where you are.";
			return;
		}
		try {
			here = await weatherHere({
				latitude: location.latitude,
				longitude: location.longitude,
			});
			hereStatus = null;
		} catch (failure) {
			hereStatus = "failed";
			hereError = toastError(failure);
		}
	}

	onMount(() => {
		const tick = setInterval(() => (clock = new Date()), 5000);
		let refresh: ReturnType<typeof setInterval> | undefined;
		if (!place) {
			hereStatus = "asking";
			void readHere();
			refresh = setInterval(() => void readHere(), hereRefreshMs);
		}
		return () => {
			clearInterval(tick);
			clearInterval(refresh);
		};
	});

	const weather = $derived(place ? saved : here);
	const zone = $derived(place ? (timezone ?? undefined) : undefined);
	const time = $derived(
		new Intl.DateTimeFormat(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
			timeZone: zone,
		}).format(clock),
	);
	const date = $derived(
		new Intl.DateTimeFormat(undefined, {
			weekday: "long",
			day: "numeric",
			month: "long",
			timeZone: zone,
		}).format(clock),
	);
	const description = $derived(describeWeather(weather?.code ?? 3));
	const today = $derived(weather?.days[0]);

	const icons: Record<WeatherKind, Component<{ class?: string }>> = {
		clear: SunIcon,
		partly: CloudSunIcon,
		cloudy: CloudIcon,
		fog: CloudFogIcon,
		drizzle: CloudDrizzleIcon,
		rain: CloudRainIcon,
		snow: CloudSnowIcon,
		storm: CloudLightningIcon,
	};

	const Icon = $derived.by(() => {
		if (weather && !weather.isDay && description.kind === "clear") {
			return MoonIcon;
		}
		if (weather && !weather.isDay && description.kind === "partly") {
			return CloudMoonIcon;
		}
		return icons[description.kind];
	});
</script>

<section
	class="glass relative flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl p-4 md:p-6"
	aria-label="Time and weather"
>
	<div class="w-full sm:w-auto sm:flex-1">
		<p
			class="font-display text-4xl leading-tight font-semibold tabular-nums md:text-5xl"
		>
			{time}
		</p>
		<p class="text-muted-foreground text-sm capitalize">{date}</p>
	</div>
	{#if weather}
		<div class="flex items-center gap-3">
			<span
				class="bg-accent text-accent-foreground flex size-12 shrink-0 items-center justify-center rounded-2xl"
				aria-hidden="true"
			>
				<Icon class="size-6" />
			</span>
			<div>
				<p class="font-display text-3xl font-semibold tabular-nums">
					{Math.round(weather.temperature)}°
				</p>
				<p class="text-muted-foreground text-sm">
					{description.label}{weather.feelsLike === null
						? ""
						: `, feels like ${Math.round(weather.feelsLike)}°`}
				</p>
			</div>
		</div>
		{#if today}
			<dl class="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
				<div>
					<dt class="sr-only">Today</dt>
					<dd class="tabular-nums">
						{Math.round(today.min)}° / {Math.round(today.max)}°
					</dd>
				</div>
				<div class="flex items-center gap-1.5">
					<dt><SunriseIcon class="size-4" aria-label="Sunrise" /></dt>
					<dd class="tabular-nums">{clockTime(today.sunrise, zone ?? null)}</dd>
				</div>
				<div class="flex items-center gap-1.5">
					<dt><SunsetIcon class="size-4" aria-label="Sunset" /></dt>
					<dd class="tabular-nums">{clockTime(today.sunset, zone ?? null)}</dd>
				</div>
			</dl>
		{/if}
		<p class="text-muted-foreground w-full text-xs sm:w-auto">
			{place ?? "Your location"}
		</p>
	{:else}
		<p class="text-muted-foreground text-sm">
			{#if place}
				The weather for {place} is on its way.
			{:else if hereStatus === "asking"}
				Finding where you are for the weather.
			{:else if hereStatus === "blocked"}
				Location is blocked, so there's no weather.
				{#if isAdmin}
					Allow it, or set where the home is with the settings button.
				{:else}
					Allow it, or ask an admin to set where the home is.
				{/if}
			{:else}
				{hereError}
			{/if}
		</p>
	{/if}
	{#if isAdmin}
		<IconButton
			label="Weather location"
			icon={SettingsIcon}
			class="text-muted-foreground absolute top-2 right-2 shrink-0 sm:static sm:-mr-2"
			onclick={() => (locating = true)}
		/>
	{/if}
</section>

<LocationSheet bind:open={locating} {home} />
