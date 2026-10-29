<script lang="ts">
	import LockIcon from "@lucide/svelte/icons/lock";
	import LockOpenIcon from "@lucide/svelte/icons/lock-open";
	import { onDestroy } from "svelte";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { type LockState, readAgo } from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlLock } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: LockState | null;
		error: string | null;
		readAt: Date | null;
		now: number;
		compact?: boolean;
		onMore?: () => void;
	}

	const {
		id,
		name,
		reading,
		error,
		readAt,
		now,
		compact = false,
		onMore,
	}: Props = $props();

	const confirmMs = 4000;

	const pending = new PendingChanges<{ locked: boolean }>({
		delayMs: 0,
		send: async ({ locked }) => {
			if (locked !== undefined) {
				await controlLock({ deviceId: id, locked });
			}
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});
	onDestroy(() => void pending.flush());

	let confirming = $state(false);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => clearTimeout(confirmTimer));

	const locked = $derived(pending.values.locked ?? reading?.locked ?? null);
	const ago = $derived(readAgo(readAt, now));

	function handleToggle() {
		if (locked === false) {
			pending.set({ locked: true });
			return;
		}
		if (!confirming) {
			confirming = true;
			confirmTimer = setTimeout(() => (confirming = false), confirmMs);
			return;
		}
		clearTimeout(confirmTimer);
		confirming = false;
		pending.set({ locked: false });
	}
</script>

<article class="glass flex flex-col gap-3 rounded-2xl p-4" data-device={id}>
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="flex size-10 shrink-0 items-center justify-center rounded-xl {locked
					? 'bg-accent text-accent-foreground'
					: 'bg-primary text-primary-foreground'}"
				aria-hidden="true"
			>
				{#if locked === false}<LockOpenIcon class="size-5" />{:else}<LockIcon
						class="size-5"
					/>{/if}
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground text-sm">
				{#if pending.error ?? error}
					<span class="text-destructive">{pending.error ?? error}</span>
				{:else if reading?.jammed}
					<span class="text-destructive">Jammed</span>
				{:else if locked === null}
					Not read yet
				{:else}
					{locked ? "Locked" : "Unlocked"}{reading?.battery != null
						? `, battery ${reading.battery}%`
						: ""}
				{/if}
			</p>
		</div>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
		<Button
			variant={confirming
				? "destructive"
				: locked === false
					? "default"
					: "secondary"}
			class="h-11 rounded-xl px-4"
			disabled={locked === null || pending.sending}
			onclick={handleToggle}
			>{#if locked === false}Lock{:else if confirming}Tap again to unlock{:else}Unlock{/if}</Button
		>
		<CardMore {name} onclick={onMore} />
	</header>
	{#if ago && !compact}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>
