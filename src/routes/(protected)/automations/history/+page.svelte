<script lang="ts">
	import HistoryIcon from "@lucide/svelte/icons/history";

	import EmptyState from "#lib/components/empty-state.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { readAgo } from "#lib/devices.js";
	import type { RunStatus } from "#lib/dto/automation-run.js";

	const { data } = $props();

	const statusLabels: Record<RunStatus, string> = {
		running: "Running",
		waiting: "Waiting",
		done: "Ran",
		failed: "Failed",
		skipped: "Skipped",
	};
	const statusVariants: Record<
		RunStatus,
		"default" | "secondary" | "destructive" | "outline"
	> = {
		running: "default",
		waiting: "secondary",
		done: "outline",
		failed: "destructive",
		skipped: "secondary",
	};
</script>

{#if data.runs.length === 0}
	<div class="glass rounded-2xl">
		<EmptyState
			icon={HistoryIcon}
			title="Nothing ran yet"
			subtitle="Every run of a routine shows here for 30 days: what set it off, and what failed."
		/>
	</div>
{:else}
	<ul
		class="glass divide-border flex flex-col divide-y rounded-2xl px-4 md:px-6"
	>
		{#each data.runs as run (run.id)}
			<li class="flex flex-col gap-1 py-3 md:flex-row md:items-center md:gap-4">
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate font-medium">{run.automationName}</span>
					{#if run.cause}
						<span class="text-muted-foreground truncate text-sm"
							>{run.cause}</span
						>
					{/if}
					{#if run.error}
						<span
							class={run.status === "failed"
								? "text-destructive text-sm"
								: "text-muted-foreground text-sm"}>{run.error}</span
						>
					{/if}
				</div>
				<div class="flex items-center gap-3">
					<Badge variant={statusVariants[run.status]}
						>{statusLabels[run.status]}</Badge
					>
					<span class="text-muted-foreground text-xs"
						>{readAgo(run.startedAt)}</span
					>
				</div>
			</li>
		{/each}
	</ul>
{/if}
