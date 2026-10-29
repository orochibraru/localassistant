<script lang="ts">
	import { readAgo } from "#lib/devices.js";
	import type { PersonPresence } from "#lib/presence.js";

	interface Props {
		people: PersonPresence[];
		now: number;
	}

	const { people, now }: Props = $props();

	const tracked = $derived(people.filter((person) => person.tracked));
</script>

{#if tracked.length > 0}
	<ul class="flex flex-wrap gap-2" aria-label="Who's home">
		{#each tracked as person (person.id)}
			<li
				class="glass flex min-h-11 items-center gap-2 rounded-full py-1 pr-4 pl-1"
			>
				<span
					class={person.home
						? "bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full font-semibold"
						: "bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full font-semibold"}
					aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</span
				>
				<span class="flex flex-col leading-tight">
					<span class="text-sm font-medium">{person.name}</span>
					<span class="text-muted-foreground text-xs"
						>{person.home === null
							? "Not known yet"
							: `${person.home ? "Home" : "Away"}${person.changedAt ? `, ${readAgo(person.changedAt, now)}` : ""}`}</span
					>
				</span>
			</li>
		{/each}
	</ul>
{/if}
