<script lang="ts">
	interface Bar {
		key: string;
		label: string;
		value: number;
	}

	interface Props {
		title: string;
		bars: Bar[];
		unit?: string;
	}

	const { title, bars, unit = "kWh" }: Props = $props();

	const height = 160;
	const top = 12;
	const bottom = 22;
	const left = 36;
	let width = $state(600);
	const slot = $derived((width - left) / Math.max(bars.length, 1));
	const barWidth = $derived(Math.max(2, Math.min(24, slot - 2)));

	let hovered = $state<number | null>(null);
	const focused = $derived(hovered === null ? undefined : bars[hovered]);
	let showTable = $state(false);

	const niceMax = $derived.by(() => {
		const max = Math.max(...bars.map((bar) => bar.value), 0);
		if (max <= 0) {
			return 1;
		}
		const magnitude = 10 ** Math.floor(Math.log10(max));
		const step =
			[1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= max / 4) ?? 10;
		return Math.ceil(max / (step * magnitude)) * step * magnitude;
	});
	const ticks = $derived([0, niceMax / 2, niceMax]);
	const plotHeight = height - top - bottom;
	const y = (value: number) =>
		top + plotHeight - (value / niceMax) * plotHeight;
	const format = (value: number) =>
		value >= 1000
			? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`
			: value.toLocaleString(undefined, {
					maximumFractionDigits: value < 10 ? 1 : 0,
				});
	const labelEvery = $derived(Math.max(1, Math.ceil(bars.length / 8)));

	function columnPath(index: number, value: number): string {
		const x = left + index * slot + (slot - barWidth) / 2;
		const yTop = y(value);
		const base = top + plotHeight;
		const radius = Math.min(4, base - yTop);
		return `M${x},${base} V${yTop + radius} Q${x},${yTop} ${x + radius},${yTop} H${x + barWidth - radius} Q${x + barWidth},${yTop} ${x + barWidth},${yTop + radius} V${base} Z`;
	}
</script>

<figure class="flex flex-col gap-2">
	<figcaption class="flex items-baseline justify-between gap-3">
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
				<tr
					><th class="py-1 font-medium">When</th><th
						class="py-1 text-right font-medium">{unit}</th
					></tr
				>
			</thead>
			<tbody>
				{#each bars as bar (bar.key)}
					<tr class="border-border border-t">
						<td class="py-1">{bar.label}</td>
						<td class="py-1 text-right tabular-nums">{format(bar.value)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<div class="relative" bind:clientWidth={width}>
			<svg
				viewBox="0 0 {width} {height}"
				class="block h-40 w-full"
				role="img"
				aria-label="{title}, one bar each"
			>
				{#each ticks as tick (tick)}
					<line
						x1={left}
						x2={width}
						y1={y(tick)}
						y2={y(tick)}
						class="stroke-border"
						stroke-width="1"
					/>
					<text
						x={left - 6}
						y={y(tick)}
						dy="0.32em"
						text-anchor="end"
						class="fill-muted-foreground text-[10px]">{format(tick)}</text
					>
				{/each}
				{#each bars as bar, index (bar.key)}
					{#if bar.value > 0}
						<path
							d={columnPath(index, bar.value)}
							class="fill-primary transition-opacity"
							opacity={hovered === null || hovered === index ? 1 : 0.45}
						/>
					{/if}
					<rect
						role="presentation"
						x={left + index * slot}
						y={top}
						width={slot}
						height={plotHeight + bottom}
						fill="transparent"
						onpointerenter={() => (hovered = index)}
						onpointerleave={() => (hovered = null)}
					/>
					{#if (bars.length - 1 - index) % labelEvery === 0}
						<text
							x={index === bars.length - 1
								? width
								: left + index * slot + slot / 2}
							y={height - 6}
							text-anchor={index === bars.length - 1 ? "end" : "middle"}
							class="fill-muted-foreground text-[10px]">{bar.label}</text
						>
					{/if}
				{/each}
			</svg>
			{#if hovered !== null && focused}
				<p
					class="bg-popover text-popover-foreground border-border pointer-events-none absolute top-0 rounded-lg border px-2 py-1 text-xs shadow-md"
					style="left: {((left + hovered * slot + slot / 2) / width) *
						100}%; transform: translateX(-50%)"
				>
					{focused.label}:
					<span class="font-semibold tabular-nums"
						>{format(focused.value)} {unit}</span
					>
				</p>
			{/if}
		</div>
	{/if}
</figure>
