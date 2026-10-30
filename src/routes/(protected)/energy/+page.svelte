<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";
	import FlameIcon from "@lucide/svelte/icons/flame";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import TargetIcon from "@lucide/svelte/icons/target";
	import TrendingDownIcon from "@lucide/svelte/icons/trending-down";
	import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
	import ZapIcon from "@lucide/svelte/icons/zap";

	import EmptyState from "#lib/components/empty-state.svelte";
	import EnergyBars from "#lib/components/energy/energy-bars.svelte";
	import EnergyBreakdown from "#lib/components/energy/energy-breakdown.svelte";
	import EnergyLines from "#lib/components/energy/energy-lines.svelte";
	import EnergyPeriod from "#lib/components/energy/energy-period.svelte";
	import StatCard from "#lib/components/stat-card.svelte";
	import {
		bucketLabel,
		dayName,
		type EnergyBucket,
		rangeLabel,
	} from "#lib/energy.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	setPageTitle("Energy");

	const report = $derived(data.energy);
	const period = $derived(rangeLabel(report.range));
	const change = $derived(
		report.house.previousTotal > 0
			? (report.house.total - report.house.previousTotal) /
					report.house.previousTotal
			: null,
	);
	const cardCount = $derived(
		3 +
			Number(report.house.peak !== null) +
			Number(report.house.lowest !== null) +
			Number(report.house.projection !== null),
	);
	const weekdayNames = Array.from({ length: 7 }, (_, index) =>
		new Date(Date.UTC(2024, 0, 1 + index)).toLocaleDateString(undefined, {
			weekday: "short",
			timeZone: "UTC",
		}),
	);
	const breakdown = $derived.by(() => {
		const parts = report.appliances
			.filter((appliance) => appliance.total > 0)
			.toSorted((first, second) => second.total - first.total)
			.map((appliance) => ({
				key: appliance.deviceId,
				name: appliance.name,
				kilowattHours: appliance.total,
			}));
		const measured = parts.reduce((sum, part) => sum + part.kilowattHours, 0);
		const rest = Math.round((report.house.total - measured) * 100) / 100;
		return report.house.metered && rest > 0
			? [
					...parts,
					{ key: "rest", name: "Everything else", kilowattHours: rest },
				]
			: parts;
	});
	const appliances = $derived(
		report.appliances.toSorted((first, second) => second.total - first.total),
	);

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
		void goto(
			`${resolve("/(protected)/energy")}?${new URLSearchParams(query)}`,
			{ reset: false },
		);
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
		<EnergyPeriod
			range={report.range}
			months={report.months}
			today={report.today}
			onChoose={show}
		/>

		<ul
			class="flex flex-wrap gap-3 lg:grid lg:grid-cols-[repeat(var(--cards),minmax(0,1fr))]"
			style:--cards={cardCount}
			aria-label="Figures for {period}"
		>
			<li class="grid min-w-0 flex-[1_1_14rem] *:min-w-0">
				<StatCard
					icon={ZapIcon}
					label={report.house.metered ? "The house used" : "Measured"}
					value={kilowattHours(report.house.total)}
					hint={period}
				/>
			</li>
			<li class="grid min-w-0 flex-[1_1_14rem] *:min-w-0">
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
					hint="vs {kilowattHours(report.house.previousTotal)} before"
				/>
			</li>
			<li class="grid min-w-0 flex-[1_1_14rem] *:min-w-0">
				<StatCard
					icon={CalendarDaysIcon}
					label="A day on average"
					value={kilowattHours(report.house.averagePerDay)}
				/>
			</li>
			{#if report.house.peak}
				<li class="grid min-w-0 flex-[1_1_14rem] *:min-w-0">
					<StatCard
						icon={FlameIcon}
						label="The most"
						value={kilowattHours(report.house.peak.kilowattHours)}
						hint={bucketLabel(report.house.peak.key, report.range.unit)}
					/>
				</li>
			{/if}
			{#if report.house.lowest}
				<li class="grid min-w-0 flex-[1_1_14rem] *:min-w-0">
					<StatCard
						icon={MoonIcon}
						label="The quietest day"
						value={kilowattHours(report.house.lowest.kilowattHours)}
						hint={bucketLabel(report.house.lowest.key, "day")}
					/>
				</li>
			{/if}
			{#if report.house.projection !== null}
				<li class="grid min-w-0 flex-[1_1_14rem] *:min-w-0">
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
				title="{period}{report.house.metered ? '' : ', metered appliances'}"
				bars={bars(report.house.buckets)}
			/>
		</section>

		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<section class="glass rounded-2xl p-4 md:p-6">
				<EnergyLines
					title="Running total"
					currentLabel={period}
					previousLabel="The same span before"
					points={report.profile.cumulative.map((point) => ({
						key: point.day,
						label: bucketLabel(point.day, "day"),
						current: point.current,
						previous: point.previous,
					}))}
				/>
			</section>
			<section class="glass rounded-2xl p-4 md:p-6">
				<EnergyBreakdown
					title="Where it goes"
					parts={breakdown}
					total={report.house.total}
				/>
			</section>
			<section class="glass rounded-2xl p-4 md:p-6">
				<EnergyBars
					title="An average week"
					bars={report.profile.weekdays.map((value, index) => ({
						key: String(index),
						label: weekdayNames[index] ?? "",
						value,
					}))}
				/>
			</section>
			{#if report.profile.hours}
				<section class="glass rounded-2xl p-4 md:p-6">
					<EnergyBars
						title="An average day"
						bars={report.profile.hours.map((value, hour) => ({
							key: String(hour),
							label: `${hour}h`,
							value,
						}))}
					/>
				</section>
			{/if}
		</div>

		{#if appliances.length > 0}
			<section aria-labelledby="appliances-heading" class="flex flex-col gap-3">
				<h2 id="appliances-heading" class="px-1 text-lg font-semibold">
					Appliances
				</h2>
				<ul
					class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] md:gap-4"
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
							<EnergyBars title={period} bars={bars(appliance.buckets)} />
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
