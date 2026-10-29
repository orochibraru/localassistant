<script lang="ts">
	import PlugIcon from "@lucide/svelte/icons/plug";
	import { onDestroy } from "svelte";

	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { readAgo, type SwitchState } from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlSwitch } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: SwitchState | null;
		readAt: Date | null;
		now: number;
	}

	const { id, name, reading, readAt, now }: Props = $props();

	const pending = new PendingChanges<{ on: boolean }>({
		delayMs: 200,
		send: async ({ on }) => {
			if (on !== undefined) {
				await controlSwitch({ deviceId: id, on });
			}
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});
	onDestroy(() => void pending.flush());

	const on = $derived(pending.values.on ?? reading?.on ?? false);
	const ago = $derived(readAgo(readAt, now));
</script>

<article class="glass flex flex-col gap-3 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		<span
			class="flex size-10 shrink-0 items-center justify-center rounded-xl {on
				? 'bg-primary text-primary-foreground'
				: 'bg-accent text-accent-foreground'}"
			aria-hidden="true"
		>
			<PlugIcon class="size-5" />
		</span>
		<label for="{id}-power" class="min-w-0 flex-1 cursor-pointer">
			<span class="block truncate font-semibold">{name}</span>
			<span class="text-muted-foreground block text-sm">
				{#if pending.error}
					<span class="text-destructive">{pending.error}</span>
				{:else if reading?.power != null}
					{Math.round(reading.power)} W{reading.energy != null
						? `, ${reading.energy.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh in total`
						: ""}
				{:else}
					{on ? "On" : "Off"}
				{/if}
			</span>
		</label>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
		<Switch
			id="{id}-power"
			checked={on}
			disabled={reading?.on === null}
			onCheckedChange={(next) => pending.set({ on: next })}
		/>
	</header>
	{#if ago}
		<p class="text-muted-foreground text-xs">Reported {ago}</p>
	{/if}
</article>
