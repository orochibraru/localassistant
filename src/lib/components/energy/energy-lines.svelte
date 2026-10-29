<script lang="ts">
	interface Point {
		key: string;
		label: string;
		current: number | null;
		previous: number;
	}

	interface Props {
		title: string;
		points: Point[];
		currentLabel: string;
		previousLabel: string;
		unit?: string;
	}

	const {
		title,
		points,
		currentLabel,
		previousLabel,
		unit = "kWh",
	}: Props = $props();

	const height = 180;
	const top = 12;
	const bottom = 22;
	const left = 40;
	const right = 8;
	let width = $state(600);
	let hovered = $state<number | null>(null);
	let showTable = $state(false);

	const plotHeight = height - top - bottom;
	const step = $derived(
		(width - left - right) / Math.max(points.length - 1, 1),
	);
	const niceMax = $derived.by(() => {
		const max = Math.max(
			...points.map((point) => Math.max(point.current ?? 0, point.previous)),
			0,
		);
		if (max <= 0) {
			return 1;
		}
		const magnitude = 10 ** Math.floor(Math.log10(max));
		const factor =
			[1, 2, 2.5, 5, 10].find((entry) => entry * magnitude >= max / 4) ?? 10;
		return Math.ceil(max / (factor * magnitude)) * factor * magnitude;
	});
	const ticks = $derived([0, niceMax / 2, niceMax]);
	const labelEvery = $derived(Math.max(1, Math.ceil(points.length / 7)));
	const focused = $derived(hovered === null ? undefined : points[hovered]);

	const x = (index: number) => left + index * step;
	const y = (value: number) =>
		top + plotHeight - (value / niceMax) * plotHeight;
	const format = (value: number) =>
		value >= 1000
			? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`
			: value.toLocaleString(undefined, {
					maximumFractionDigits: value < 10 ? 1 : 0,
				});

	function path(values: (number | null)[]): string {
		return values
			.flatMap((value, index) =>
				value === null
					? []
					: [`${index === 0 ? "M" : "L"}${x(index)},${y(value)}`],
			)
			.join(" ")
			.replace(/^L/, "M");
	}
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
	<ul class="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
		<li class="flex items-center gap-1.5">
			<span class="bg-primary h-0.5 w-4 rounded-full" aria-hidden="true"
			></span>{currentLabel}
		</li>
		<li class="flex items-center gap-1.5">
			<span
				class="border-muted-foreground h-0 w-4 border-t-2 border-dashed"
				aria-hidden="true"
			></span>{previousLabel}
		</li>
	</ul>
	{#if showTable}
		<table class="text-sm">
			<thead class="text-muted-foreground text-left text-xs">
				<tr>
					<th class="py-1 font-medium">When</th>
					<th class="py-1 text-right font-medium">{currentLabel}</th>
					<th class="py-1 text-right font-medium">{previousLabel}</th>
				</tr>
			</thead>
			<tbody>
				{#each points as point (point.key)}
					<tr class="border-border border-t">
						<td class="py-1">{point.label}</td>
						<td class="py-1 text-right tabular-nums"
							>{point.current === null ? "–" : format(point.current)}</td
						>
						<td class="py-1 text-right tabular-nums"
							>{format(point.previous)}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<div class="relative" bind:clientWidth={width}>
			<svg
				viewBox="0 0 {width} {height}"
				class="block h-44 w-full"
				role="img"
				aria-label="{title}: {currentLabel} against {previousLabel}"
			>
				{#each ticks as tick (tick)}
					<line
						x1={left}
						x2={width - right}
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
				<path
					d={path(points.map((point) => point.previous))}
					fill="none"
					class="stroke-muted-foreground"
					stroke-width="2"
					stroke-dasharray="4 4"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d={path(points.map((point) => point.current))}
					fill="none"
					class="stroke-primary"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				{#if hovered !== null && focused}
					<line
						x1={x(hovered)}
						x2={x(hovered)}
						y1={top}
						y2={top + plotHeight}
						class="stroke-muted-foreground"
						stroke-width="1"
					/>
					{#if focused.current !== null}
						<circle
							cx={x(hovered)}
							cy={y(focused.current)}
							r="4"
							class="fill-primary stroke-card"
							stroke-width="2"
						/>
					{/if}
					<circle
						cx={x(hovered)}
						cy={y(focused.previous)}
						r="4"
						class="fill-muted-foreground stroke-card"
						stroke-width="2"
					/>
				{/if}
				{#each points as point, index (point.key)}
					<rect
						role="presentation"
						x={x(index) - step / 2}
						y={top}
						width={Math.max(step, 1)}
						height={plotHeight + bottom}
						fill="transparent"
						onpointerenter={() => (hovered = index)}
						onpointerleave={() => (hovered = null)}
					/>
					{#if (points.length - 1 - index) % labelEvery === 0}
						<text
							x={x(index)}
							y={height - 6}
							text-anchor={index === points.length - 1
								? "end"
								: index === 0
									? "start"
									: "middle"}
							class="fill-muted-foreground text-[10px]">{point.label}</text
						>
					{/if}
				{/each}
			</svg>
			{#if hovered !== null && focused}
				<div
					class="bg-popover text-popover-foreground border-border pointer-events-none absolute top-0 rounded-lg border px-2 py-1 text-xs shadow-md"
					style="left: {(x(hovered) / width) *
						100}%; transform: translateX(-50%)"
				>
					<p class="font-medium">{focused.label}</p>
					<p class="tabular-nums">
						{currentLabel}: {focused.current === null
							? "–"
							: `${format(focused.current)} ${unit}`}
					</p>
					<p class="text-muted-foreground tabular-nums">
						{previousLabel}: {format(focused.previous)}
						{unit}
					</p>
				</div>
			{/if}
		</div>
	{/if}
</figure>
