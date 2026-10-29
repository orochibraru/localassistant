<script lang="ts">
	import UserIcon from "@lucide/svelte/icons/user";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import { type PresenceState, readAgo } from "#lib/devices.js";

	interface Props {
		name: string;
		ownerName: string | null;
		reading: PresenceState | null;
		error: string | null;
		readAt: Date | null;
		now: number;
		compact?: boolean;
		onMore?: () => void;
	}

	const {
		name,
		ownerName,
		reading,
		error,
		readAt,
		now,
		compact = false,
		onMore,
	}: Props = $props();

	const where = $derived(
		reading?.home === true
			? "Home"
			: reading?.zone
				? reading.zone
				: reading?.home === false
					? "Away"
					: "Not known yet",
	);
</script>

<article class="glass flex flex-col gap-3 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class={reading?.home
					? "bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
					: "bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"}
				aria-hidden="true"
			>
				<UserIcon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground truncate text-sm">
				{#if error}
					<span class="text-destructive">{error}</span>
				{:else}
					{where}{ownerName ? `, counts for ${ownerName}` : ""}
				{/if}
			</p>
		</div>
		<CardMore {name} onclick={onMore} />
	</header>
	{#if !compact && (reading?.battery !== null || readAt)}
		<p class="text-muted-foreground text-xs">
			{#if reading?.battery !== null && reading?.battery !== undefined}Battery {reading.battery}%{/if}
			{#if readAt}{reading?.battery != null ? " · " : ""}Updated {readAgo(
					readAt,
					now,
				)}{/if}
		</p>
	{/if}
</article>
