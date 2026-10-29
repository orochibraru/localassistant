<script lang="ts">
	import BatteryLowIcon from "@lucide/svelte/icons/battery-low";
	import DoorClosedIcon from "@lucide/svelte/icons/door-closed";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import GaugeIcon from "@lucide/svelte/icons/gauge";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import EnergyBars from "#lib/components/energy/energy-bars.svelte";
	import {
		type ContactState,
		type LinkyState,
		type MeterState,
		readAgo,
	} from "#lib/devices.js";
	import { bucketLabel, type EnergySummary } from "#lib/energy.js";

	interface Props {
		id: string;
		name: string;
		reading: ContactState | MeterState | LinkyState | null;
		error?: string | null;
		readAt: Date | null;
		now: number;
		compact?: boolean;
		onMore?: () => void;
		details?: EnergySummary | null;
	}

	const {
		id,
		name,
		reading,
		readAt,
		now,
		error = null,
		compact = false,
		onMore,
		details = null,
	}: Props = $props();

	const kilowattHours = (value: number) =>
		`${value.toLocaleString(undefined, { maximumFractionDigits: value < 10 ? 1 : 0 })} kWh`;
	const change = $derived(
		details && details.lastMonth > 0
			? Math.round(
					((details.thisMonth - details.lastMonth) / details.lastMonth) * 100,
				)
			: null,
	);

	const ago = $derived(readAgo(readAt, now));
	const Icon = $derived.by(() => {
		if (reading?.type === "meter" || reading?.type === "linky") {
			return GaugeIcon;
		}
		return reading?.open ? DoorOpenIcon : DoorClosedIcon;
	});
	const summary = $derived.by(() => {
		if (!reading) {
			return "Waiting for its first report";
		}
		if (reading.type === "linky") {
			return reading.kilowattHours === null || !reading.day
				? "No data from Enedis yet"
				: `${reading.kilowattHours} kWh on ${reading.day.slice(8)}/${reading.day.slice(5, 7)}`;
		}
		if (reading.type === "contact") {
			if (reading.open === null) {
				return "Waiting for its first report";
			}
			return reading.open ? "Open" : "Shut";
		}
		const power =
			reading.power === null ? null : `${Math.round(reading.power)} W now`;
		const energy =
			reading.energy === null
				? null
				: `${reading.energy.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh in total`;
		return (
			[power, energy].filter(Boolean).join(", ") ||
			"Waiting for its first report"
		);
	});
</script>

<article class="glass flex flex-col gap-3 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="flex size-10 shrink-0 items-center justify-center rounded-xl {reading?.type ===
					'contact' && reading.open
					? 'bg-primary text-primary-foreground'
					: 'bg-accent text-accent-foreground'}"
				aria-hidden="true"
			>
				<Icon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground text-sm">
				{#if error}<span class="text-destructive">{error}</span
					>{:else}{summary}{/if}
			</p>
		</div>
		{#if reading?.type === "contact" && reading.battery !== null && reading.battery < 20}
			<span class="text-destructive flex items-center gap-1 text-sm"
				><BatteryLowIcon class="size-4" />{reading.battery}%</span
			>
		{/if}
		<CardMore {name} onclick={onMore} />
	</header>
	{#if details && !compact}
		<dl class="grid grid-cols-2 gap-3 text-sm">
			<div class="bg-muted/60 rounded-xl px-3 py-2">
				<dt class="text-muted-foreground text-xs">This month so far</dt>
				<dd class="font-medium tabular-nums">
					{kilowattHours(details.thisMonth)}
				</dd>
				<dd class="text-muted-foreground text-xs tabular-nums">
					{kilowattHours(details.lastMonth)} last month{change === null
						? ""
						: `, ${change > 0 ? "+" : ""}${change}%`}
				</dd>
			</div>
			<div class="bg-muted/60 rounded-xl px-3 py-2">
				<dt class="text-muted-foreground text-xs">A day on average</dt>
				<dd class="font-medium tabular-nums">
					{kilowattHours(details.averagePerDay)}
				</dd>
				<dd class="text-muted-foreground text-xs">this month</dd>
			</div>
		</dl>
		<EnergyBars
			title="Last 7 days"
			bars={details.days.map((day) => ({
				key: day.key,
				label: bucketLabel(day.key, "day"),
				value: day.kilowattHours,
			}))}
		/>
	{/if}
	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">Reported {ago}</p>
	{/if}
</article>
