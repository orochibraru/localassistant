<script lang="ts">
	import BlindsIcon from "@lucide/svelte/icons/blinds";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import ThermometerIcon from "@lucide/svelte/icons/thermometer";
	import type { Component } from "svelte";

	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { roomLabels } from "#lib/house.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { useSheets } from "#lib/sheets.svelte.js";

	const { data } = $props();

	const sheets = useSheets();

	setPageTitle("Devices");

	type Device = (typeof data.devices)[number];

	const kindLabels: Record<Device["kind"], string> = {
		"tuya-cover": "Tuya blind",
		"melcloud-ata": "Air-to-air heat pump",
		"melcloud-atw": "Air-to-water heat pump",
		"bambu-printer": "Bambu Lab printer",
	};

	const kindIcons: Record<Device["kind"], Component<{ class?: string }>> = {
		"tuya-cover": BlindsIcon,
		"melcloud-ata": ThermometerIcon,
		"melcloud-atw": ThermometerIcon,
		"bambu-printer": PrinterIcon,
	};

	const roomNames = $derived(roomLabels(data.rooms, data.floors));
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(20rem,28rem)_1fr] lg:items-start">
	<div class="flex flex-col gap-6">
		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">Mitsubishi (MELCloud)</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					{data.melCloudEmail
						? `Connected as ${data.melCloudEmail}. Units are read every two minutes.`
						: "Sign in with the account the MELCloud app uses to bring in every unit."}
				</p>
			</div>
			<Button
				variant={data.melCloudEmail ? "outline" : "default"}
				class="h-11 self-start rounded-xl px-5"
				onclick={() => (sheets.addDevice = "melcloud")}
			>
				{#if data.melCloudEmail}<SettingsIcon />Manage{:else}<PlusIcon
					/>Connect{/if}
			</Button>
		</section>

		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">Tuya blinds</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Controlled straight over your network, no cloud. Each blind needs its
					device ID and local key from the Tuya IoT Platform, once.
				</p>
			</div>
			<Button
				class="h-11 self-start rounded-xl px-5"
				onclick={() => (sheets.addDevice = "blind")}
				><PlusIcon />Add a blind</Button
			>
		</section>

		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">Bambu Lab printers</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Read over your network with the printer's access code. Pausing,
					stopping and the light need LAN-only mode with Developer Mode on the
					printer.
				</p>
			</div>
			<Button
				class="h-11 self-start rounded-xl px-5"
				onclick={() => (sheets.addDevice = "printer")}
				><PlusIcon />Add a printer</Button
			>
		</section>
	</div>

	{#if data.devices.length > 0}
		<ul class="glass divide-border divide-y rounded-2xl">
			{#each data.devices as device (device.id)}
				{@const Icon = kindIcons[device.kind]}
				<li>
					<button
						type="button"
						class="hover:bg-muted/50 flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl md:px-4"
						onclick={() => (sheets.editDeviceId = device.id)}
					>
						<span
							class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
							aria-hidden="true"
						>
							<Icon class="size-5" />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium">{device.name}</span>
							<span class="text-muted-foreground block truncate text-sm">
								{kindLabels[device.kind]}, {device.roomId
									? (roomNames.get(device.roomId) ?? "Whole house")
									: "Whole house"}
							</span>
						</span>
						{#if device.stateError}
							<Badge variant="destructive">Unreachable</Badge>
						{:else if device.state}
							<Badge variant="secondary">Online</Badge>
						{:else}
							<Badge variant="outline">Not read yet</Badge>
						{/if}
						<ChevronRightIcon class="text-muted-foreground size-4 shrink-0" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
