<script lang="ts">
	import ChoiceRow from "#lib/components/automations/choice-row.svelte";
	import HistoryChart from "#lib/components/history/history-chart.svelte";
	import { Skeleton } from "#lib/components/ui/skeleton/index.js";
	import { readAgo } from "#lib/devices.js";
	import {
		type HistoryRange,
		historyRangeHours,
		historyRanges,
	} from "#lib/history.js";
	import { deviceHistory } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		deviceId: string;
		name: string;
	}

	const { deviceId, name }: Props = $props();

	const rangeLabels: Record<HistoryRange, string> = {
		day: "24 hours",
		week: "7 days",
	};

	let range = $state<HistoryRange>("day");
	let result = $state<Awaited<ReturnType<typeof deviceHistory>> | null>(null);
	let failure = $state<string | null>(null);
	let to = $state(new Date());

	$effect(() => {
		const wanted = range;
		failure = null;
		void deviceHistory({ deviceId, range: wanted })
			.then((loaded) => {
				to = new Date();
				result = loaded;
			})
			.catch((error: unknown) => {
				failure = toastError(error);
			});
	});

	const from = $derived(
		new Date(to.getTime() - historyRangeHours[range] * 3_600_000),
	);
</script>

<section class="flex flex-col gap-3" aria-label="{name} history">
	<p class="text-sm font-medium">History</p>
	<ChoiceRow
		label="Over"
		options={historyRanges.map((value) => ({
			value,
			label: rangeLabels[value],
		}))}
		value={range}
		onChange={(next) => (range = next === "week" ? "week" : "day")}
	/>
	{#if failure}
		<p class="text-destructive text-sm">{failure}</p>
	{:else if !result}
		<Skeleton class="h-40 w-full rounded-xl" />
	{:else}
		{#if result.points.length > 1}
			<HistoryChart
				title="{name} over {rangeLabels[range]}"
				points={result.points}
				unit={result.unit}
				{from}
				{to}
			/>
		{/if}
		{#if result.lines.length > 0}
			<ul class="divide-border flex flex-col divide-y text-sm">
				{#each result.lines as line (line.id)}
					<li class="flex items-baseline justify-between gap-3 py-2">
						<span class="min-w-0">{line.message}</span>
						<span class="text-muted-foreground shrink-0 text-xs"
							>{readAgo(line.at)}</span
						>
					</li>
				{/each}
			</ul>
		{:else if result.points.length <= 1}
			<p class="text-muted-foreground text-sm">
				Nothing recorded yet: it fills in as the device reports.
			</p>
		{/if}
	{/if}
</section>
