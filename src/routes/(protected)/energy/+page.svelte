<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";
	import CheckIcon from "@lucide/svelte/icons/check";
	import FlameIcon from "@lucide/svelte/icons/flame";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import TargetIcon from "@lucide/svelte/icons/target";
	import TrendingDownIcon from "@lucide/svelte/icons/trending-down";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
	import ZapIcon from "@lucide/svelte/icons/zap";

	import EmptyState from "#lib/components/empty-state.svelte";
	import EnergyBars from "#lib/components/energy/energy-bars.svelte";
	import Picker from "#lib/components/picker.svelte";
	import StatCard from "#lib/components/stat-card.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import {
		bucketLabel,
		type EnergyBucket,
		energyPresetLabels,
		energyPresets,
		monthName,
	} from "#lib/energy.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	setPageTitle("Energy");

	const report = $derived(data.energy);
	const custom = "custom";
	let choosing = $state(false);
	let from = $state("");
	let to = $state("");

	const options = $derived([
		...energyPresets.map((preset) => ({
			value: preset,
			label: energyPresetLabels[preset],
		})),
		...report.months.map((month) => ({
			value: `month:${month}`,
			label: monthName(month),
		})),
		{ value: custom, label: "Custom range…" },
	]);
	const picked = $derived(choosing ? custom : report.range.key);
	const rangeLabel = $derived(
		report.range.key === custom
			? `${dayName(report.range.from)} to ${dayName(report.range.to)}`
			: (options.find((option) => option.value === report.range.key)?.label ??
					""),
	);
	const change = $derived(
		report.house.previousTotal > 0
			? (report.house.total - report.house.previousTotal) /
					report.house.previousTotal
			: null,
	);
	const appliances = $derived(
		report.appliances.toSorted((first, second) => second.total - first.total),
	);

	function dayName(day: string): string {
		return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
			day: "numeric",
			month: "short",
			year: "numeric",
			timeZone: "UTC",
		});
	}

	function kilowattHours(value: number): string {
		return `${value.toLocaleString(undefined, {
			maximumFractionDigits: value < 10 ? 1 : 0,
		})} kWh`;
	}

	function bars(buckets: EnergyBucket[]) {
		return buckets.map((bucket) => ({
			key: bucket.key,
			label: bucketLabel(bucket.key, report.range.unit),
			value: bucket.kilowattHours,
		}));
	}

	function show(query: Record<string, string>) {
		choosing = false;
		void goto(
			`${resolve("/(protected)/energy")}?${new URLSearchParams(query)}`,
			{ reset: false },
		);
	}

	function handlePick(next: string) {
		if (next === custom) {
			choosing = true;
			from = report.range.from;
			to = report.range.to;
			return;
		}
		show({ range: next });
	}
</script>

{#if report.appliances.length === 0 && !report.house.metered}
	<div class="glass rounded-2xl">
		<EmptyState
			icon={GaugeIcon}
			title="Nothing measures energy yet"
			subtitle="Metering plugs and the Linky reader come in through Zigbee2MQTT, Shelly meters through the same MQTT broker, and a Linky online through conso.boris.sh: add one in Devices."
		/>
	</div>
{:else}
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-3 md:flex-row md:items-end">
			<Field.Field class="md:w-72">
				<Field.Label for="energy-range">Period</Field.Label>
				<Picker
					id="energy-range"
					name=""
					label="Period"
					{options}
					value={picked}
					onPick={handlePick}
				/>
			</Field.Field>
			{#if choosing}
				<form
					class="flex flex-col gap-3 sm:flex-row sm:items-end"
					onsubmit={(event) => {
						event.preventDefault();
						show({ from, to });
					}}
				>
					<Field.Field>
						<Field.Label for="energy-from">From</Field.Label>
						<Input
							id="energy-from"
							type="date"
							bind:value={from}
							max={report.today}
							required
							class="h-11"
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label for="energy-to">To</Field.Label>
						<Input
							id="energy-to"
							type="date"
							bind:value={to}
							required
							class="h-11"
						/>
					</Field.Field>
					<Button type="submit" class="h-11 rounded-xl px-5"
						><CheckIcon />Show</Button
					>
				</form>
			{/if}
		</div>

		<ul
			class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
			aria-label="Figures for {rangeLabel}"
		>
			<li>
				<StatCard
					icon={ZapIcon}
					label={report.house.metered ? "The house used" : "Measured"}
					value={kilowattHours(report.house.total)}
					hint={rangeLabel}
				/>
			</li>
			<li>
				<StatCard
					icon={change !== null && change > 0
						? TrendingUpIcon
						: TrendingDownIcon}
					tone={change === null
						? "default"
						: change > 0
							? "warning"
							: "positive"}
					label="Compared with before"
					value={change === null
						? "No data"
						: `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`}
					hint="{kilowattHours(
						report.house.previousTotal,
					)} over the same span before"
				/>
			</li>
			<li>
				<StatCard
					icon={CalendarDaysIcon}
					label="A day on average"
					value={kilowattHours(report.house.averagePerDay)}
				/>
			</li>
			{#if report.house.peak}
				<li>
					<StatCard
						icon={FlameIcon}
						label="The most"
						value={kilowattHours(report.house.peak.kilowattHours)}
						hint={bucketLabel(report.house.peak.key, report.range.unit)}
					/>
				</li>
			{/if}
			{#if report.house.lowest}
				<li>
					<StatCard
						icon={MoonIcon}
						label="The quietest day"
						value={kilowattHours(report.house.lowest.kilowattHours)}
						hint={bucketLabel(report.house.lowest.key, "day")}
					/>
				</li>
			{/if}
			{#if report.house.projection !== null}
				<li>
					<StatCard
						icon={TargetIcon}
						label="Heading for"
						value={kilowattHours(report.house.projection)}
						hint="At this pace, by {dayName(report.range.to)}"
					/>
				</li>
			{/if}
		</ul>

		<section class="glass rounded-2xl p-4 md:p-6">
			<EnergyBars
				title="{rangeLabel}{report.house.metered ? '' : ', metered appliances'}"
				bars={bars(report.house.buckets)}
			/>
		</section>

		{#if appliances.length > 0}
			<section aria-labelledby="appliances-heading" class="flex flex-col gap-3">
				<h2 id="appliances-heading" class="px-1 text-lg font-semibold">
					Appliances
				</h2>
				<ul
					class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] md:gap-4"
				>
					{#each appliances as appliance (appliance.deviceId)}
						<li class="glass flex flex-col gap-3 rounded-2xl p-4">
							<div class="flex items-baseline justify-between gap-3">
								<h3 class="truncate font-semibold">{appliance.name}</h3>
								<p class="text-sm tabular-nums">
									{kilowattHours(appliance.total)}{#if appliance.share !== null}
										<span class="text-muted-foreground"
											>, {Math.round(appliance.share * 100)}% of the house</span
										>
									{/if}
								</p>
							</div>
							<EnergyBars title={rangeLabel} bars={bars(appliance.buckets)} />
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		<p class="text-muted-foreground flex items-center gap-2 text-xs">
			<CalendarRangeIcon class="size-4" />
			{dayName(report.range.from)} to {dayName(report.range.to)}, in the home's
			time zone.
		</p>
	</div>
{/if}
