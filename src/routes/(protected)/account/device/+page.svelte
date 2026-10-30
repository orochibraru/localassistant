<script lang="ts">
	import { enhance } from "$app/forms";
	import { invalidateAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import MonitorIcon from "@lucide/svelte/icons/monitor";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import QrCodeIcon from "@lucide/svelte/icons/qr-code";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import SmartphoneIcon from "@lucide/svelte/icons/smartphone";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import {
		currentLocation,
		readAppReport,
		rememberAppDevice,
		type StoredAppDevice,
		storedAppDevice,
	} from "#lib/app-device.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { deviceName } from "#lib/device-name.js";
	import { panelMode, setPanelMode } from "#lib/panel-mode.js";
	import { reportAppDevice } from "#lib/remote/devices.remote.js";
	import { enhanceToast, toastError } from "#lib/toast.js";

	const { data } = $props();

	let stored = $state<StoredAppDevice | null>(null);
	let suggestedName = $state("");
	let shareLocation = $state(false);
	let errors = $state<Record<string, string[]>>({});
	let panel = $state(false);
	let pairing = $state<{ qrCode: string; url: string } | null>(null);

	const registered = $derived(
		stored
			? data.setup.find(
					(device) => device.id === stored?.id && device.kind === "app",
				)
			: undefined,
	);

	onMount(() => {
		stored = storedAppDevice();
		panel = panelMode();
		shareLocation = stored?.shareLocation ?? false;
		suggestedName = `${data.user.name}'s ${deviceName(navigator.userAgent)
			.split(" on ")
			.at(-1)}`;
	});

	async function reportCallback() {
		if (!stored) {
			return;
		}
		await reportAppDevice({
			deviceId: stored.id,
			...(await readAppReport(stored.shareLocation)),
		});
		await invalidateAll();
	}

	function handleReport() {
		toast.promise(reportCallback(), {
			loading: "Sending the battery and location",
			success: "Sent.",
			error: (failure: unknown) => toastError(failure),
		});
	}

	async function shareCallback(value: boolean) {
		if (!stored) {
			return;
		}
		if (value && (await currentLocation()) === null) {
			shareLocation = false;
			throw new Error(
				"Location is blocked for LocalAssistant. Allow it in this browser's site settings.",
			);
		}
		stored = { ...stored, shareLocation: value };
		rememberAppDevice(stored);
		await reportCallback();
	}

	function handleShare(value: boolean) {
		toast.promise(shareCallback(value), {
			loading: value ? "Sharing the location" : "Stopping the location",
			success: value
				? "The location is shared while the app is open."
				: "The location isn't shared anymore.",
			error: (failure: unknown) => toastError(failure),
		});
	}

	const errorsOf = (name: string) =>
		errors[name]?.map((message) => ({ message }));
</script>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
	<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
		<div class="flex items-start gap-3">
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			>
				<SmartphoneIcon class="size-5" />
			</span>
			<div>
				<h2 class="font-semibold">
					{registered ? registered.name : "This phone or tablet"}
				</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					{registered
						? "Shows in the house with its battery and, if you share it, where it is. Sent every five minutes while the app is open."
						: "Add it to the house to see its battery and where it is. iPhones and iPads don't share their battery with web apps."}
				</p>
			</div>
		</div>
		{#if registered}
			<label
				for="share-location"
				class="flex cursor-pointer items-start justify-between gap-4"
			>
				<span>
					<span class="block font-medium">Share the location</span>
					<span class="text-muted-foreground mt-0.5 block text-sm"
						>Only while LocalAssistant is open on this device.</span
					>
				</span>
				<Switch
					id="share-location"
					bind:checked={shareLocation}
					onCheckedChange={handleShare}
					class="mt-1 shrink-0"
				/>
			</label>
			<div class="flex flex-wrap gap-3">
				<Button
					variant="outline"
					class="h-11 rounded-xl px-5"
					onclick={handleReport}><RefreshCwIcon />Send now</Button
				>
				<form
					method="POST"
					action="?/forget"
					use:enhance={enhanceToast({
						loading: "Removing",
						success: `${registered.name} is out of the house.`,
						onSuccess: () => {
							rememberAppDevice(null);
							stored = null;
						},
					})}
				>
					<input type="hidden" name="id" value={registered.id} />
					<Button
						type="submit"
						variant="ghost"
						class="text-destructive h-11 rounded-xl px-5"
						><Trash2Icon />Remove</Button
					>
				</form>
			</div>
		{:else}
			<form
				method="POST"
				action="?/register"
				class="flex flex-col gap-3 sm:flex-row sm:items-start"
				use:enhance={enhanceToast({
					loading: "Adding this device",
					success: "Added to the house.",
					onFailure: (result) =>
						(errors = (result?.errors as Record<string, string[]>) ?? {}),
					onSuccess: async (result) => {
						errors = {};
						stored = { id: String(result?.deviceId), shareLocation: false };
						rememberAppDevice(stored);
						await reportCallback();
					},
				})}
			>
				<Field.Field class="flex-1">
					<Field.Label for="app-device-name" class="sr-only">Name</Field.Label>
					<Input
						id="app-device-name"
						name="name"
						value={suggestedName}
						required
						class="h-11"
					/>
					<Field.Error errors={errorsOf("name")} />
				</Field.Field>
				<Button type="submit" class="h-11 rounded-xl px-5"
					><PlusIcon />Add to the house</Button
				>
			</form>
		{/if}
	</section>

	<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
		<div class="flex items-start gap-3">
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			>
				<QrCodeIcon class="size-5" />
			</span>
			<div>
				<h2 class="font-semibold">The LocalAssistant app</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Sign the Android or iPhone app in by scanning a code from here, or by
					typing this server's address in it. The code works once, for two
					minutes.
				</p>
			</div>
		</div>
		{#if pairing}
			<a
				href={pairing.url}
				class="size-48 self-center rounded-xl bg-white p-2 [&_svg]:size-full"
				aria-label="Pairing code: scan it with the app, or tap it on the phone to sign in"
			>
				{@html pairing.qrCode}
			</a>
		{/if}
		<form
			method="POST"
			action="?/pair"
			use:enhance={enhanceToast({
				loading: "Making a pairing code",
				success: "Scan it with the app within two minutes.",
				onSuccess: (result) => {
					pairing = (result?.pairing as typeof pairing) ?? null;
				},
			})}
		>
			<Button type="submit" variant="outline" class="h-11 rounded-xl px-5"
				><QrCodeIcon />{pairing ? "New code" : "Show a pairing code"}</Button
			>
		</form>
	</section>

	<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
		<div class="flex items-start gap-3">
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			>
				<MonitorIcon class="size-5" />
			</span>
			<div>
				<h2 class="font-semibold">Wall panel</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					For a tablet on the wall or a Shelly Wall Display: the clock, the
					weather, open windows and big buttons for each room, with the screen
					kept on.
				</p>
			</div>
		</div>
		<label
			for="panel-mode"
			class="flex cursor-pointer items-start justify-between gap-4"
		>
			<span>
				<span class="block font-medium">Open on the panel</span>
				<span class="text-muted-foreground mt-0.5 block text-sm"
					>On this device, LocalAssistant starts on the panel instead of Home.</span
				>
			</span>
			<Switch
				id="panel-mode"
				bind:checked={panel}
				onCheckedChange={(next) => setPanelMode(next)}
				class="mt-1 shrink-0"
			/>
		</label>
		<Button
			href={resolve("/(protected)/panel")}
			variant="outline"
			class="h-11 self-start rounded-xl px-5"
			><MonitorIcon />Open the panel</Button
		>
	</section>
</div>
