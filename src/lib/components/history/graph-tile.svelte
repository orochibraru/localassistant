<script lang="ts">
	import HistoryChart from "#lib/components/history/history-chart.svelte";
	import { Skeleton } from "#lib/components/ui/skeleton/index.js";
	import { type HistoryRange, historyRangeHours } from "#lib/history.js";
	import { deviceHistory } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		deviceId: string;
		name: string;
		range: HistoryRange;
	}

	const { deviceId, name, range }: Props = $props();

	let result = $state<Awaited<ReturnType<typeof deviceHistory>> | null>(null);
	let failure = $state<string | null>(null);
	let to = $state(new Date());

	$effect(() => {
		failure = null;
		void deviceHistory({ deviceId, range })
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

<div class="glass rounded-2xl p-4">
	{#if failure}
		<p class="text-destructive text-sm">{name}: {failure}</p>
	{:else if !result}
		<Skeleton class="h-40 w-full rounded-xl" />
	{:else if result.points.length > 1}
		<HistoryChart
			title={name}
			points={result.points}
			unit={result.unit}
			{from}
			{to}
		/>
	{:else}
		<p class="text-sm font-medium">{name}</p>
		<p class="text-muted-foreground text-sm">
			Nothing recorded yet: it fills in as the device reports.
		</p>
	{/if}
</div>
