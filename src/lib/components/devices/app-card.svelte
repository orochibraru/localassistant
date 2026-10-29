<script lang="ts">
	import BatteryChargingIcon from "@lucide/svelte/icons/battery-charging";
	import BatteryFullIcon from "@lucide/svelte/icons/battery-full";
	import BatteryLowIcon from "@lucide/svelte/icons/battery-low";
	import BatteryMediumIcon from "@lucide/svelte/icons/battery-medium";
	import MapPinIcon from "@lucide/svelte/icons/map-pin";
	import SmartphoneIcon from "@lucide/svelte/icons/smartphone";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import {
		type AppState,
		describeDistance,
		distanceMetres,
		readAgo,
	} from "#lib/devices.js";

	interface Props {
		id: string;
		name: string;
		ownerName: string | null;
		reading: AppState | null;
		readAt: Date | null;
		home: { latitude: number; longitude: number } | null;
		now: number;
		compact?: boolean;
		onMore?: () => void;
	}

	const {
		id,
		name,
		ownerName,
		reading,
		readAt,
		home,
		now,
		compact = false,
		onMore,
	}: Props = $props();

	const ago = $derived(readAgo(readAt, now));
	const location = $derived(reading?.location ?? null);
	const BatteryIcon = $derived.by(() => {
		if (reading?.charging) {
			return BatteryChargingIcon;
		}
		const level = reading?.battery ?? 100;
		if (level < 25) {
			return BatteryLowIcon;
		}
		return level < 70 ? BatteryMediumIcon : BatteryFullIcon;
	});
	const where = $derived.by(() => {
		if (!location) {
			return null;
		}
		return home
			? describeDistance(distanceMetres(home, location))
			: "Location shared";
	});
</script>

<article class="glass flex flex-col gap-4 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
				aria-hidden="true"
			>
				<SmartphoneIcon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground truncate text-sm">
				{ownerName ?? "Nobody's"}{reading?.platform
					? `, ${reading.platform}`
					: ""}
			</p>
		</div>
		<CardMore {name} onclick={onMore} />
	</header>
	{#if !compact}
		{#if reading}
			<dl class="grid grid-cols-2 gap-3">
				<div class="bg-secondary/60 flex items-center gap-2 rounded-xl p-3">
					<BatteryIcon class="text-muted-foreground size-5 shrink-0" />
					<div>
						<dt class="sr-only">Battery</dt>
						<dd class="font-medium">
							{reading.battery === null ? "Unknown" : `${reading.battery}%`}
						</dd>
						<dd class="text-muted-foreground text-xs">
							{reading.charging ? "Charging" : "Battery"}
						</dd>
					</div>
				</div>
				<div class="bg-secondary/60 flex items-center gap-2 rounded-xl p-3">
					<MapPinIcon class="text-muted-foreground size-5 shrink-0" />
					<div class="min-w-0">
						<dt class="sr-only">Location</dt>
						<dd class="truncate font-medium">
							{#if location}
								<a
									class="underline-offset-4 hover:underline"
									href="https://www.openstreetmap.org/?mlat={location.latitude}&mlon={location.longitude}#map=16/{location.latitude}/{location.longitude}"
									target="_blank"
									rel="noopener noreferrer">{where}</a
								>
							{:else}
								Not shared
							{/if}
						</dd>
						<dd class="text-muted-foreground truncate text-xs">
							{location ? readAgo(new Date(location.at), now) : "Location"}
						</dd>
					</div>
				</div>
			</dl>
		{:else}
			<p class="text-muted-foreground text-sm">
				Hasn't reported yet: open LocalAssistant on it.
			</p>
		{/if}
	{/if}
	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">Reported {ago}</p>
	{/if}
</article>
