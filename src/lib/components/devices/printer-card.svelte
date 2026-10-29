<script lang="ts">
	import CameraIcon from "@lucide/svelte/icons/camera";
	import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
	import LightbulbOffIcon from "@lucide/svelte/icons/lightbulb-off";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import SquareIcon from "@lucide/svelte/icons/square";
	import { onDestroy } from "svelte";

	import IconButton from "#lib/components/icon-button.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import {
		type Heater,
		type PrinterChange,
		type PrinterSpeed,
		printerSpeedLabels,
		printerSpeeds,
		printerStageLabels,
		type PrinterState,
		readAgo,
		timeLeft,
	} from "#lib/devices.js";
	import { PendingChanges } from "#lib/pending-changes.svelte.js";
	import { controlPrinter } from "#lib/remote/devices.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		id: string;
		name: string;
		reading: PrinterState | null;
		error: string | null;
		readAt: Date | null;
		now: number;
	}

	const { id, name, reading, error, readAt, now }: Props = $props();

	let expected = $state<{ change: PrinterChange; since: number | null } | null>(
		null,
	);
	let confirmingStop = $state(false);

	const pending = new PendingChanges<PrinterChange>({
		delayMs: 400,
		send: async (change) => {
			await controlPrinter({ deviceId: id, ...change });
			expected = { change, since: readAt?.getTime() ?? null };
		},
		describe: (failure) => toastError(failure, `${name} didn't answer.`),
	});
	let watching = $state(false);
	let frame = $state(0);

	onDestroy(() => void pending.flush());

	const stillExpected = $derived(
		expected && expected.since === (readAt?.getTime() ?? null)
			? expected.change
			: {},
	);
	const shown = $derived(
		reading ? apply(apply(reading, stillExpected), pending.values) : null,
	);
	let speed = $derived<string>(shown?.speed ? String(shown.speed) : "");
	const active = $derived(
		shown?.stage === "printing" ||
			shown?.stage === "paused" ||
			shown?.stage === "preparing",
	);
	const ago = $derived(readAgo(readAt, now));

	function apply(state: PrinterState, change: PrinterChange): PrinterState {
		const stages = {
			pause: "paused",
			resume: "printing",
			stop: "idle",
		} as const;
		return {
			...state,
			stage: change.command ? stages[change.command] : state.stage,
			light: change.light ?? state.light,
			speed: change.speed ?? state.speed,
		};
	}

	function temperature(heater: Heater): string {
		if (heater.temperature === null) {
			return "--";
		}
		const current = `${Math.round(heater.temperature)}°`;
		return heater.target
			? `${current} / ${Math.round(heater.target)}°`
			: current;
	}

	function handleSpeed(next: string) {
		const level = Number(next) as PrinterSpeed;
		if (!next) {
			speed = shown?.speed ? String(shown.speed) : "";
			return;
		}
		if (level !== shown?.speed) {
			pending.set({ speed: level });
		}
	}

	function stopPrint() {
		confirmingStop = false;
		pending.set({ command: "stop" });
		void pending.flush();
	}
</script>

<article class="glass flex flex-col gap-4 rounded-2xl p-4">
	<header class="flex items-center gap-3">
		<span
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			aria-hidden="true"
		>
			<PrinterIcon class="size-5" />
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="truncate font-semibold">{name}</h2>
			<p class="text-muted-foreground truncate text-sm">
				{#if pending.error ?? error}
					<span class="text-destructive">{pending.error ?? error}</span>
				{:else if !shown}
					Not read yet
				{:else}
					{printerStageLabels[shown.stage]}{active && shown.fileName
						? `: ${shown.fileName}`
						: ""}
				{/if}
			</p>
		</div>
		{#if pending.sending}
			<Spinner class="text-muted-foreground" aria-label="Sending to {name}" />
		{/if}
		{#if shown && shown.light !== null}
			<IconButton
				label={shown.light
					? `Turn ${name}'s light off`
					: `Turn ${name}'s light on`}
				icon={shown.light ? LightbulbIcon : LightbulbOffIcon}
				variant={shown.light ? "default" : "secondary"}
				onclick={() => pending.set({ light: !shown.light })}
			/>
		{/if}
		<IconButton
			label={watching ? `Hide ${name}'s camera` : `Show ${name}'s camera`}
			icon={CameraIcon}
			variant={watching ? "default" : "secondary"}
			onclick={() => (watching = !watching)}
		/>
	</header>

	{#if watching}
		<img
			src="/printers/{id}/camera.jpg?at={frame}"
			alt="{name}'s camera"
			class="aspect-video w-full rounded-xl bg-black object-contain"
			onload={() => setTimeout(() => (frame += 1), 2000)}
			onerror={() => setTimeout(() => (frame += 1), 5000)}
		/>
	{/if}

	{#if shown}
		{#if active}
			<div class="flex flex-col gap-2">
				<div
					class="bg-muted h-2 overflow-hidden rounded-full"
					role="progressbar"
					aria-label="{name} progress"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={shown.progress ?? 0}
				>
					<div
						class="bg-primary h-full rounded-full transition-[width]"
						style="width: {shown.progress ?? 0}%"
					></div>
				</div>
				<p class="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
					<span class="text-foreground font-medium tabular-nums"
						>{shown.progress ?? 0}%</span
					>
					{#if shown.remainingMinutes !== null}
						<span>{timeLeft(shown.remainingMinutes)} left</span>
					{/if}
					{#if shown.layer !== null && shown.totalLayers}
						<span class="tabular-nums"
							>layer {shown.layer} / {shown.totalLayers}</span
						>
					{/if}
				</p>
			</div>
		{/if}

		<dl class="grid grid-cols-2 gap-3 text-sm">
			<div class="bg-muted/60 rounded-xl px-3 py-2">
				<dt class="text-muted-foreground text-xs">Nozzle</dt>
				<dd class="font-medium tabular-nums">{temperature(shown.nozzle)}</dd>
			</div>
			<div class="bg-muted/60 rounded-xl px-3 py-2">
				<dt class="text-muted-foreground text-xs">Bed</dt>
				<dd class="font-medium tabular-nums">{temperature(shown.bed)}</dd>
			</div>
		</dl>

		{#if active}
			<div class="flex gap-2">
				{#if shown.stage === "paused"}
					<Button
						variant="secondary"
						class="h-11 flex-1 rounded-xl"
						onclick={() => pending.set({ command: "resume" })}
						><PlayIcon />Resume</Button
					>
				{:else}
					<Button
						variant="secondary"
						class="h-11 flex-1 rounded-xl"
						onclick={() => pending.set({ command: "pause" })}
						><PauseIcon />Pause</Button
					>
				{/if}
				<Button
					variant="destructive"
					class="h-11 flex-1 rounded-xl"
					onclick={() => (confirmingStop = true)}><SquareIcon />Stop</Button
				>
			</div>

			<ToggleGroup.Root
				type="single"
				bind:value={speed}
				spacing={2}
				aria-label="{name} print speed"
				class="w-full flex-wrap"
				onValueChange={handleSpeed}
			>
				{#each printerSpeeds as level (level)}
					<ToggleGroup.Item
						value={String(level)}
						class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 rounded-xl"
						>{printerSpeedLabels[level]}</ToggleGroup.Item
					>
				{/each}
			</ToggleGroup.Root>
		{/if}
	{/if}

	{#if ago}
		<p class="text-muted-foreground text-xs">Read {ago}</p>
	{/if}
</article>

<ResponsiveSheet
	bind:open={confirmingStop}
	title="Stop the print on {name}?"
	description="A stopped print can't be resumed."
>
	<div class="flex flex-col gap-3 pb-6 md:flex-row-reverse">
		<Button
			variant="destructive"
			class="h-11 rounded-xl px-5"
			onclick={stopPrint}><SquareIcon />Stop the print</Button
		>
		<Button
			variant="secondary"
			class="h-11 rounded-xl px-5"
			onclick={() => (confirmingStop = false)}>Keep printing</Button
		>
	</div>
</ResponsiveSheet>
