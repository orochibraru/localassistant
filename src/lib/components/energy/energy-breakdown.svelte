<script lang="ts">
	interface Part {
		key: string;
		name: string;
		kilowattHours: number;
	}

	interface Props {
		title: string;
		parts: Part[];
		total: number;
	}

	const { title, parts, total }: Props = $props();

	const largest = $derived(
		Math.max(...parts.map((part) => part.kilowattHours), 0),
	);
	const format = (value: number) =>
		value.toLocaleString(undefined, {
			maximumFractionDigits: value < 10 ? 1 : 0,
		});
</script>

<figure class="flex flex-col gap-3">
	<figcaption class="text-sm font-medium">{title}</figcaption>
	{#if parts.length === 0}
		<p class="text-muted-foreground text-sm">
			Nothing measured over this period.
		</p>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each parts as part (part.key)}
				<li class="flex flex-col gap-1.5">
					<p class="flex items-baseline justify-between gap-3 text-sm">
						<span class="min-w-0 truncate">{part.name}</span>
						<span class="shrink-0 tabular-nums"
							>{format(part.kilowattHours)} kWh{#if total > 0}<span
									class="text-muted-foreground"
								>
									· {Math.round((part.kilowattHours / total) * 100)}%</span
								>{/if}</span
						>
					</p>
					<div class="bg-muted h-2 overflow-hidden rounded-full">
						<div
							class="bg-primary h-full rounded-full"
							style="width: {largest > 0
								? (part.kilowattHours / largest) * 100
								: 0}%"
						></div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</figure>
