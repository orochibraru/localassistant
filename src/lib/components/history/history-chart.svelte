<script lang="ts">
	import type { HistoryPoint } from "#lib/history.js";

	interface Props {
		title: string;
		points: HistoryPoint[];
		unit: string;
		from: Date;
		to: Date;
	}

	const { title, points, unit, from, to }: Props = $props();

	const height = 160;
	const top = 12;
	const bottom = 22;
	const left = 44;
	const right = 8;
	let width = $state(600);
	let showTable = $state(false);

	const plotHeight = height - top - bottom;
	const values = $derived(points.map((point) => point.value));
	const low = $derived(Math.min(...values, 0));
	const high = $derived(Math.max(...values, low + 1));
	const span = $derived(to.getTime() - from.getTime() || 1);

	const x = (at: Date) =>
		left + ((at.getTime() - from.getTime()) / span) * (width - left - right);
	const y = (value: number) =>
		top + plotHeight - ((value - low) / (high - low)) * plotHeight;
	const format = (value: number) =>
		`${value.toLocaleString(undefined, { maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 })}${unit ? ` ${unit}` : ""}`;
	const time = (at: Date) =>
		span > 2 * 86_400_000
			? at.toLocaleDateString(undefined, { weekday: "short" })
			: at.toLocaleTimeString(undefined, {
					hour: "2-digit",
					minute: "2-digit",
				});

	const line = $derived(
		points
			.map(
				(point, index) =>
					`${index === 0 ? "M" : "L"}${x(point.at).toFixed(1)},${y(point.value).toFixed(1)}`,
			)
			.join(" "),
	);
	const ticks = $derived(
		[0, 0.25, 0.5, 0.75, 1].map(
			(share) => new Date(from.getTime() + share * span),
		),
	);
</script>

<figure class="flex flex-col gap-2">
	<figcaption class="flex flex-wrap items-baseline justify-between gap-x-3">
		<span class="text-sm font-medium">{title}</span>
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground min-h-11 text-xs underline-offset-4 hover:underline"
			onclick={() => (showTable = !showTable)}
			>{showTable ? "Show the chart" : "Show as a table"}</button
		>
	</figcaption>
	{#if showTable}
		<table class="text-sm">
			<thead class="text-muted-foreground text-left text-xs">
				<tr>
					<th class="py-1 font-medium">When</th>
					<th class="py-1 text-right font-medium">Value</th>
				</tr>
			</thead>
			<tbody>
				{#each points.toReversed() as point (point.at.getTime())}
					<tr class="border-border border-t">
						<td class="py-1">{point.at.toLocaleString()}</td>
						<td class="py-1 text-right tabular-nums">{format(point.value)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<div class="w-full" bind:clientWidth={width}>
			<svg
				{width}
				{height}
				role="img"
				aria-label="{title}: from {format(Math.min(...values))} to {format(
					Math.max(...values),
				)}"
			>
				{#each [low, (low + high) / 2, high] as tick (tick)}
					<line
						x1={left}
						x2={width - right}
						y1={y(tick)}
						y2={y(tick)}
						class="stroke-border"
						stroke-dasharray="2 4"
					/>
					<text
						x={left - 6}
						y={y(tick) + 4}
						text-anchor="end"
						class="fill-muted-foreground text-[10px]">{format(tick)}</text
					>
				{/each}
				{#each ticks as tick (tick.getTime())}
					<text
						x={x(tick)}
						y={height - 6}
						text-anchor="middle"
						class="fill-muted-foreground text-[10px]">{time(tick)}</text
					>
				{/each}
				<path
					d={line}
					class="stroke-primary"
					fill="none"
					stroke-width="2"
					stroke-linejoin="round"
				/>
			</svg>
		</div>
	{/if}
</figure>
