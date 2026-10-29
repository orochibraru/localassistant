<script lang="ts">
	import GaugeIcon from "@lucide/svelte/icons/gauge";

	import EmptyState from "#lib/components/empty-state.svelte";
	import EnergyBars from "#lib/components/energy/energy-bars.svelte";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	setPageTitle("Energy");

	const monthNames = new Intl.DateTimeFormat(undefined, { month: "short" });
	const dayLabel = (key: string) => `${key.slice(8)}/${key.slice(5, 7)}`;
	const monthLabel = (key: string) =>
		monthNames.format(
			new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1),
		);
	const days = (buckets: { key: string; kilowattHours: number }[]) =>
		buckets.map((bucket) => ({
			key: bucket.key,
			label: dayLabel(bucket.key),
			value: bucket.kilowattHours,
		}));
	const months = (buckets: { key: string; kilowattHours: number }[]) =>
		buckets.map((bucket) => ({
			key: bucket.key,
			label: monthLabel(bucket.key),
			value: bucket.kilowattHours,
		}));
	const kilowattHours = (value: number) =>
		value.toLocaleString(undefined, {
			maximumFractionDigits: value < 10 ? 1 : 0,
		});

	const thisMonth = $derived(
		data.energy.house.months.at(-1)?.kilowattHours ?? 0,
	);
	const appliances = $derived(
		data.energy.appliances.toSorted(
			(first, second) =>
				(second.months.at(-1)?.kilowattHours ?? 0) -
				(first.months.at(-1)?.kilowattHours ?? 0),
		),
	);
</script>

{#if data.energy.appliances.length === 0 && !data.energy.house.metered}
	<div class="glass rounded-2xl">
		<EmptyState
			icon={GaugeIcon}
			title="Nothing measures energy yet"
			subtitle="Metering plugs and the Linky reader come in through Zigbee2MQTT, Shelly meters through the same MQTT broker: connect it in Devices."
		/>
	</div>
{:else}
	<div class="flex flex-col gap-6">
		<section
			class="glass grid gap-6 rounded-2xl p-4 md:p-6 lg:grid-cols-[16rem_1fr_1fr]"
		>
			<div>
				<p class="text-muted-foreground text-sm">
					{data.energy.house.metered
						? "The house this month"
						: "Measured this month"}
				</p>
				<p class="text-5xl font-semibold tabular-nums">
					{kilowattHours(thisMonth)}<span
						class="text-muted-foreground ml-1 text-lg font-medium">kWh</span
					>
				</p>
				<p class="text-muted-foreground mt-2 text-sm">
					{data.energy.house.metered
						? "From the whole-house meter."
						: "The sum of the metered appliances: add a Linky reader for the whole house."}
				</p>
			</div>
			<EnergyBars title="Last 30 days" bars={days(data.energy.house.days)} />
			<EnergyBars
				title="Last 12 months"
				bars={months(data.energy.house.months)}
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
									{kilowattHours(appliance.months.at(-1)?.kilowattHours ?? 0)} kWh
									<span class="text-muted-foreground">this month</span>
								</p>
							</div>
							<EnergyBars title="Last 30 days" bars={days(appliance.days)} />
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
{/if}
