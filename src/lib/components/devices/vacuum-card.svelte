<script lang="ts">
	import BotIcon from "@lucide/svelte/icons/bot";
	import HouseIcon from "@lucide/svelte/icons/house";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import SquareIcon from "@lucide/svelte/icons/square";
	import { onDestroy } from "svelte";

	import IconButton from "#lib/components/icon-button.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import {
		readAgo,
		type VacuumCommand,
		type VacuumStage,
		type VacuumState,
	} from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlVacuum } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: VacuumState | null;
		error: string | null;
		readAt: Date | null;
		now: number;
	}

	const { id, name, reading, error, readAt, now }: Props = $props();

	const stageLabels: Record<VacuumStage, string> = {
		cleaning: "Cleaning",
		idle: "Idle",
		paused: "Paused",
		returning: "Going back to the dock",
		charging: "Charging",
		docked: "Docked, charged",
		washing: "Washing its mops",
		error: "Needs a hand",
	};

	const commandStages: Record<VacuumCommand, VacuumStage> = {
		start: "cleaning",
		pause: "paused",
		dock: "returning",
		stop: "idle",
	};

	const pending = new PendingChanges<{ command: VacuumCommand }>({
		delayMs: 300,
		send: async ({ command }) => {
			if (command) {
				await controlVacuum({ deviceId: id, command });
			}
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});

	onDestroy(() => void pending.flush());

	const stage = $derived(
		pending.values.command
			? commandStages[pending.values.command]
			: (reading?.stage ?? null),
	);
	const ago = $derived(readAgo(readAt, now));
</script>

<article class="glass flex flex-col gap-4 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		<span
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			aria-hidden="true"
		>
			<BotIcon class="size-5" />
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground text-sm">
				{#if pending.error}
					<span class="text-destructive">{pending.error}</span>
				{:else if error && !pending.values.command}
					<span class="text-destructive">{error}</span>
				{:else if stage}
					{stageLabels[stage]}{reading?.battery != null
						? `, ${reading.battery}%`
						: ""}{reading?.errorCode ? ` (error ${reading.errorCode})` : ""}
				{:else}
					Not read yet
				{/if}
			</p>
		</div>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
	</header>
	<div class="flex justify-between gap-2">
		{#if stage === "cleaning"}
			<IconButton
				label="Pause {name}"
				icon={PauseIcon}
				variant="secondary"
				class="flex-1 rounded-xl md:h-11 md:flex-1"
				onclick={() => pending.set({ command: "pause" })}
			/>
		{:else}
			<IconButton
				label="Start {name}"
				icon={PlayIcon}
				variant="secondary"
				class="flex-1 rounded-xl md:h-11 md:flex-1"
				onclick={() => pending.set({ command: "start" })}
			/>
		{/if}
		<IconButton
			label="Stop {name}"
			icon={SquareIcon}
			variant="secondary"
			class="flex-1 rounded-xl md:h-11 md:flex-1"
			onclick={() => pending.set({ command: "stop" })}
		/>
		<IconButton
			label="Send {name} to its dock"
			icon={HouseIcon}
			variant="secondary"
			class="flex-1 rounded-xl md:h-11 md:flex-1"
			onclick={() => pending.set({ command: "dock" })}
		/>
	</div>
	{#if ago}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>
