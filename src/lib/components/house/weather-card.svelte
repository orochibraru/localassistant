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
	import SunIcon from "@lucide/svelte/icons/sun";
	import SunriseIcon from "@lucide/svelte/icons/sunrise";
	import SunsetIcon from "@lucide/svelte/icons/sunset";
	import type { Component } from "svelte";

	import {
		clockTime,
		describeWeather,
		type Weather,
		type WeatherKind,
	} from "#lib/weather.js";

	interface Props {
		place: string;
		timezone: string | null;
		weather: Weather;
	}

	const { place, timezone, weather }: Props = $props();

	const description = $derived(describeWeather(weather.code));
	const today = $derived(weather.days[0]);

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
		if (!weather.isDay && description.kind === "clear") {
			return MoonIcon;
		}
		if (!weather.isDay && description.kind === "partly") {
			return CloudMoonIcon;
		}
		return icons[description.kind];
	});
</script>

<section
	class="glass flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl p-4"
	aria-label="Weather in {place}"
>
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
				<dd class="tabular-nums">{clockTime(today.sunrise, timezone)}</dd>
			</div>
			<div class="flex items-center gap-1.5">
				<dt><SunsetIcon class="size-4" aria-label="Sunset" /></dt>
				<dd class="tabular-nums">{clockTime(today.sunset, timezone)}</dd>
			</div>
		</dl>
	{/if}
	<p class="text-muted-foreground ml-auto text-xs">{place}</p>
</section>
