<script lang="ts">
	import BlindsIcon from "@lucide/svelte/icons/blinds";
	import BotIcon from "@lucide/svelte/icons/bot";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import SmartphoneIcon from "@lucide/svelte/icons/smartphone";
	import ThermometerIcon from "@lucide/svelte/icons/thermometer";
	import type { Component } from "svelte";

	import {
		deviceKindIcons,
		deviceKindLabels,
	} from "#lib/components/devices/device-kinds.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { roomLabels } from "#lib/house.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { useSheets } from "#lib/sheets.svelte.js";

	const { data } = $props();

	const sheets = useSheets();

	setPageTitle("Devices", undefined, [
		{
			label: "Add a device",
			icon: PlusIcon,
			primary: true,
			onSelect: () => (sheets.pickDevice = true),
		},
	]);

	type Device = (typeof data.devices)[number];

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
			<div class="flex flex-wrap gap-3">
				<Button
					variant={data.melCloudEmail ? "outline" : "default"}
					class="h-11 rounded-xl px-5"
					onclick={() => (sheets.addDevice = "melcloud")}
				>
					{#if data.melCloudEmail}<SettingsIcon />Manage{:else}<PlusIcon
						/>Connect{/if}
				</Button>
				<Button
					variant="secondary"
					class="h-11 rounded-xl px-5"
					onclick={() => (sheets.addDevice = "esphome")}
					><PlusIcon />Add through ESPHome</Button
				>
			</div>
		</section>

		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">Dreame robot vacuums</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					{data.dreameEmail
						? `Connected as ${data.dreameEmail}. Robots are read every two minutes.`
						: "Sign in with the account the Dreamehome app uses. Dreame may refuse anything but its own app; if it does, the error says so."}
				</p>
			</div>
			<Button
				variant={data.dreameEmail ? "outline" : "default"}
				class="h-11 self-start rounded-xl px-5"
				onclick={() => (sheets.addDevice = "dreame")}
			>
				{#if data.dreameEmail}<SettingsIcon />Manage{:else}<PlusIcon
					/>Connect{/if}
			</Button>
		</section>

		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">Zigbee (Zigbee2MQTT)</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					{data.brokerUrl
						? `Listening on ${data.brokerUrl}. Door and window sensors, radiator valves, relays, plugs and the Linky reader show up on their own once paired in Zigbee2MQTT.`
						: "Point LocalAssistant at the MQTT broker Zigbee2MQTT publishes to: its devices come in by themselves."}
				</p>
			</div>
			<Button
				variant={data.brokerUrl ? "outline" : "default"}
				class="h-11 self-start rounded-xl px-5"
				onclick={() => (sheets.addDevice = "zigbee")}
			>
				{#if data.brokerUrl}<SettingsIcon />Manage{:else}<PlusIcon
					/>Connect{/if}
			</Button>
		</section>

		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">Cameras</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Cameras with local RTSP are watched and recorded by this server. A
					Frigate NVR brings its own cameras, events and clips.
				</p>
			</div>
			<div class="flex flex-wrap gap-3">
				<Button
					class="h-11 rounded-xl px-5"
					onclick={() => (sheets.addDevice = "camera")}
					><PlusIcon />Add a camera</Button
				>
				<Button
					variant={data.frigateUrl ? "outline" : "secondary"}
					class="h-11 rounded-xl px-5"
					onclick={() => (sheets.addDevice = "frigate")}
				>
					{#if data.frigateUrl}<SettingsIcon />Frigate{:else}<PlusIcon />Connect
						Frigate{/if}
				</Button>
			</div>
		</section>

		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">Linky</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Live, through the ZLinky_TIC Zigbee reader. Or online with no
					hardware: Enedis's daily use, a day behind, through conso.boris.sh.
				</p>
			</div>
			<Button
				class="h-11 self-start rounded-xl px-5"
				onclick={() => (sheets.addDevice = "linky")}
				><PlusIcon />Add a Linky online</Button
			>
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
				{@const Icon = deviceKindIcons[device.kind]}
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
								{deviceKindLabels[device.kind]}, {device.roomId
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
