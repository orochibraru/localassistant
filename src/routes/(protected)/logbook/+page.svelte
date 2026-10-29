<script lang="ts">
	import { resolve } from "$app/paths";
	import ScrollTextIcon from "@lucide/svelte/icons/scroll-text";

	import EmptyState from "#lib/components/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	setPageTitle("Logbook");

	const days = $derived.by(() => {
		const groups: { day: string; lines: typeof data.lines }[] = [];
		for (const line of data.lines) {
			const day = line.at.toLocaleDateString(undefined, {
				weekday: "long",
				day: "numeric",
				month: "long",
			});
			const group = groups.at(-1);
			if (group?.day === day) {
				group.lines.push(line);
			} else {
				groups.push({ day, lines: [line] });
			}
		}
		return groups;
	});
</script>

{#if data.lines.length === 0}
	<div class="glass rounded-2xl">
		<EmptyState
			icon={ScrollTextIcon}
			title="Nothing happened yet"
			subtitle="Lights turning on, doors opening, people coming home and routines running show here for 30 days."
		/>
	</div>
{:else}
	<div class="flex flex-col gap-6">
		{#each days as group (group.day)}
			<section aria-label={group.day}>
				<h2 class="text-muted-foreground mb-2 text-sm font-medium">
					{group.day}
				</h2>
				<ul
					class="glass divide-border flex flex-col divide-y rounded-2xl px-4 md:px-6"
				>
					{#each group.lines as line (line.id)}
						<li class="flex items-baseline gap-3 py-3">
							<span
								class="text-muted-foreground w-12 shrink-0 text-xs tabular-nums"
								>{line.at.toLocaleTimeString(undefined, {
									hour: "2-digit",
									minute: "2-digit",
								})}</span
							>
							<span class="min-w-0 text-sm"
								><span class="font-medium">{line.name}</span>
								{line.message}</span
							>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		{#if data.older}
			<Button
				variant="outline"
				class="h-11 self-center rounded-xl px-5"
				href="{resolve('/(protected)/logbook')}?before={data.older}"
				>Older</Button
			>
		{/if}
	</div>
{/if}
