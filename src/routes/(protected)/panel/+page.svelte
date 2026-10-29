<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import { onMount } from "svelte";

	import DeviceGrid from "#lib/components/devices/device-grid.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import type { CoverAction, DeviceState } from "#lib/devices.js";
	import { houseGroups, roomLabels } from "#lib/house.js";
	import { LiveRefresh } from "#lib/live-refresh.svelte.js";
	import { setPanelMode } from "#lib/panel-mode.js";
	import { withCard } from "#lib/plugins.js";
	import { controlBlinds } from "#lib/remote/devices.remote.js";
	import { roomIcon } from "#lib/room-icons.js";
	import { toastError } from "#lib/toast.js";
	import { describeWeather } from "#lib/weather.js";

	const { data } = $props();

	const live = new LiveRefresh(20_000);

	let clock = $state(new Date());
	let sending = $state<string | null>(null);
	let failure = $state<{ key: string; message: string } | null>(null);

	onMount(() => {
		const timer = setInterval(() => (clock = new Date()), 5000);
		let lock: { release: () => Promise<void> } | null = null;
		const keepAwake = async () => {
			if (document.visibilityState === "visible" && "wakeLock" in navigator) {
				lock = await navigator.wakeLock.request("screen").catch(() => null);
			}
		};
		void keepAwake();
		document.addEventListener("visibilitychange", keepAwake);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", keepAwake);
			void lock?.release();
		};
	});

	const timeZone = $derived(data.home.timezone ?? undefined);
	const time = $derived(
		new Intl.DateTimeFormat(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			timeZone,
		}).format(clock),
	);
	const date = $derived(
		new Intl.DateTimeFormat(undefined, {
			weekday: "long",
			day: "numeric",
			month: "long",
			timeZone,
		}).format(clock),
	);
	const weather = $derived(data.home.weather);
	const labels = $derived(roomLabels(data.rooms, data.floors));

	const stateOf = (device: { state: unknown }) =>
		device.state as DeviceState | null;
	const openings = $derived(
		data.devices.filter((device) => {
			const state = stateOf(device);
			return state?.type === "contact" && state.open;
		}),
	);
	const rooms = $derived(
		houseGroups(data.floors, data.rooms)
			.flatMap((group) => group.rooms)
			.map((room) => {
				const inside = data.devices.filter(
					(device) => device.roomId === room.id,
				);
				const temperatures = inside.flatMap((device) => {
					const state = stateOf(device);
					if (state?.type === "climate" && state.roomTemperature !== null) {
						return [state.roomTemperature];
					}
					return state?.type === "valve" && state.temperature !== null
						? [state.temperature]
						: [];
				});
				return {
					...room,
					label: labels.get(room.id) ?? room.name,
					blinds: withCard(data.kinds, inside, "cover").length,
					open: inside.filter((device) => openings.includes(device)).length,
					temperature: temperatures[0] ?? null,
				};
			})
			.filter(
				(room) => room.blinds > 0 || room.temperature !== null || room.open > 0,
			),
	);
	const controls = $derived(
		withCard(
			data.kinds,
			data.devices,
			"climate",
			"printer",
			"vacuum",
			"valve",
			"switch",
			"camera",
			"linky",
		),
	);
	const hasBlinds = $derived(
		withCard(data.kinds, data.devices, "cover").length > 0,
	);

	async function blinds(roomId: string | null, action: CoverAction) {
		const key = `${roomId ?? "all"}:${action}`;
		sending = key;
		failure = null;
		try {
			await controlBlinds({ roomId, action });
		} catch (error) {
			failure = {
				key: roomId ?? "all",
				message: toastError(error, "The blinds didn't answer."),
			};
		} finally {
			sending = null;
		}
	}

	function leave() {
		setPanelMode(false);
		void goto(resolve("/(protected)"));
	}
</script>

<svelte:head><title>{data.home.name} | LocalAssistant</title></svelte:head>

{#snippet blindButtons(roomId: string | null, label: string)}
	<div class="grid grid-cols-2 gap-2">
		{#each [{ action: "open", icon: ChevronUpIcon, word: "Open" }, { action: "close", icon: ChevronDownIcon, word: "Close" }] as const as button (button.action)}
			<button
				type="button"
				class="bg-secondary hover:bg-secondary/80 flex h-14 items-center justify-center gap-2 rounded-2xl text-base font-medium transition-transform active:scale-95"
				aria-label="{button.word} {label}"
				onclick={() => blinds(roomId, button.action)}
			>
				{#if sending === `${roomId ?? "all"}:${button.action}`}<Spinner
					/>{:else}<button.icon class="size-5" />{/if}
				{button.word}
			</button>
		{/each}
	</div>
	{#if failure?.key === (roomId ?? "all")}
		<p class="text-destructive text-sm">{failure.message}</p>
	{/if}
{/snippet}

<div
	class="pt-safe-top pb-safe-bottom flex min-h-dvh flex-col gap-4 p-4 lg:gap-6 lg:p-6"
>
	<header class="flex flex-wrap items-center gap-x-8 gap-y-2">
		<div class="flex-1">
			<p
				class="font-display text-5xl leading-tight font-semibold tabular-nums sm:text-6xl lg:text-7xl"
			>
				{time}
			</p>
			<p class="text-muted-foreground mt-2 text-lg capitalize">{date}</p>
		</div>
		{#if weather}
			<div class="text-right">
				<p class="text-4xl font-semibold tabular-nums">
					{Math.round(weather.temperature)}°
				</p>
				<p class="text-muted-foreground">
					{describeWeather(weather.code).label}
				</p>
			</div>
		{/if}
		<IconButton
			label="Leave the panel"
			icon={LogOutIcon}
			variant="ghost"
			onclick={leave}
		/>
	</header>

	{#if openings.length > 0}
		<p
			class="bg-primary/15 flex min-h-12 items-center gap-3 rounded-2xl px-4 text-base"
		>
			<DoorOpenIcon class="size-5 shrink-0" />
			Open: {openings.map((device) => device.name).join(", ")}
		</p>
	{/if}

	<section
		class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] lg:gap-4"
		aria-label="Rooms"
	>
		{#if hasBlinds}
			<div class="glass flex flex-col gap-3 rounded-3xl p-4">
				<p class="text-lg font-semibold">Every blind</p>
				{@render blindButtons(null, "every blind")}
			</div>
		{/if}
		{#each rooms as room (room.id)}
			{@const Icon = roomIcon(room.icon)}
			<div class="glass flex flex-col gap-3 rounded-3xl p-4">
				<div class="flex items-center gap-3">
					<span
						class="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-2xl"
					>
						<Icon class="size-5" />
					</span>
					<p class="min-w-0 flex-1 truncate text-lg font-semibold">
						{room.label}
					</p>
					{#if room.temperature !== null}
						<p class="text-2xl font-semibold tabular-nums">
							{room.temperature}°
						</p>
					{/if}
				</div>
				{#if room.open > 0}
					<p class="text-sm">
						<DoorOpenIcon class="inline size-4" />
						{room.open === 1
							? "A window is open"
							: `${room.open} windows are open`}
					</p>
				{/if}
				{#if room.blinds > 0}
					{@render blindButtons(room.id, `the blinds in ${room.label}`)}
				{/if}
			</div>
		{/each}
	</section>

	{#if controls.length > 0}
		<DeviceGrid devices={controls} now={live.now} />
	{/if}
</div>
