<script lang="ts">
	import MousePointerClickIcon from "@lucide/svelte/icons/mouse-pointer-click";

	import CardMore from "#lib/components/devices/card-more.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { type ButtonState, readAgo } from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { pressButton } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: ButtonState | null;
		error: string | null;
		now: number;
		compact?: boolean;
		onMore?: () => void;
	}

	const {
		id,
		name,
		reading,
		error,
		now,
		compact = false,
		onMore,
	}: Props = $props();

	const pending = new PendingChanges<{ pressed: boolean }>({
		delayMs: 0,
		send: async () => {
			await pressButton({ deviceId: id });
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});

	const pressed = $derived(
		reading?.pressedAt ? readAgo(new Date(reading.pressedAt), now) : null,
	);
</script>

<article class="glass flex flex-col gap-3 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		{#if !compact}
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
				aria-hidden="true"
			>
				<MousePointerClickIcon class="size-5" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground truncate text-sm">
				{#if pending.error ?? error}
					<span class="text-destructive">{pending.error ?? error}</span>
				{:else if pressed}
					Pressed {pressed}
				{:else}
					Never pressed here
				{/if}
			</p>
		</div>
		<Button
			variant="secondary"
			class="h-11 rounded-xl px-4"
			disabled={pending.sending}
			onclick={() => pending.set({ pressed: true })}
		>
			{#if pending.sending}<Spinner />{/if}Press
		</Button>
		<CardMore {name} onclick={onMore} />
	</header>
</article>
