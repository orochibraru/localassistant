<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import UnplugIcon from "@lucide/svelte/icons/unplug";

	import { addDeviceOptions } from "#lib/components/devices/device-kinds.js";
	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { tuyaProtocolVersions } from "#lib/devices.js";
	import type { DeviceRow } from "#lib/dto/device.js";
	import { type HouseFloor, type HouseRoom, roomLabels } from "#lib/house.js";
	import { type AddDeviceSheet, useSheets } from "#lib/sheets.svelte.js";
	import { enhanceToast } from "#lib/toast.js";

	type Device = Omit<DeviceRow, "state">;

	interface Props {
		devices: Device[];
		rooms: HouseRoom[];
		floors: HouseFloor[];
		melCloudEmail: string | null;
		dreameEmail: string | null;
		brokerUrl: string | null;
		frigateUrl: string | null;
		people: { id: string; name: string }[];
	}

	const {
		devices,
		rooms,
		floors,
		melCloudEmail,
		dreameEmail,
		brokerUrl,
		frigateUrl,
		people,
	}: Props = $props();

	const sheets = useSheets();
	const devicesPath = resolve("/(protected)/devices");

	let errors = $state<Record<string, string[]>>({});
	let confirmingRemove = $state(false);

	const editing = $derived(
		devices.find((device) => device.id === sheets.editDeviceId),
	);
	const roomOptions = $derived([
		{ value: "house", label: "Whole house" },
		...[...roomLabels(rooms, floors)]
			.map(([value, label]) => ({ value, label }))
			.toSorted((first, second) => first.label.localeCompare(second.label)),
	]);
	const versionOptions = tuyaProtocolVersions.map((version) => ({
		value: version,
		label: version,
	}));

	const editActions: Record<Device["kind"], string> = {
		"tuya-cover": "editTuya",
		"bambu-printer": "editBambu",
		"melcloud-ata": "rename",
		"melcloud-atw": "rename",
		app: "editApp",
		"dreame-vacuum": "rename",
		"zigbee-contact": "rename",
		"zigbee-valve": "rename",
		"zigbee-switch": "rename",
		"zigbee-meter": "rename",
		"shelly-meter": "rename",
		linky: "editLinky",
		camera: "editCamera",
		"frigate-camera": "rename",
		"esphome-climate": "editEspHome",
	};
	const integrations: Partial<
		Record<Device["kind"], { sheet: AddDeviceSheet; label: string }>
	> = {
		"melcloud-ata": { sheet: "melcloud", label: "Manage MELCloud" },
		"melcloud-atw": { sheet: "melcloud", label: "Manage MELCloud" },
		"dreame-vacuum": { sheet: "dreame", label: "Manage the Dreame account" },
		"zigbee-contact": { sheet: "zigbee", label: "Manage the MQTT broker" },
		"zigbee-valve": { sheet: "zigbee", label: "Manage the MQTT broker" },
		"zigbee-switch": { sheet: "zigbee", label: "Manage the MQTT broker" },
		"zigbee-meter": { sheet: "zigbee", label: "Manage the MQTT broker" },
		"shelly-meter": { sheet: "zigbee", label: "Manage the MQTT broker" },
		"frigate-camera": { sheet: "frigate", label: "Manage Frigate" },
	};
	const integration = $derived(
		editing ? integrations[editing.kind] : undefined,
	);
	const regionOptions = [
		{ value: "eu", label: "Europe" },
		{ value: "us", label: "Americas" },
		{ value: "sg", label: "Asia" },
		{ value: "cn", label: "China" },
		{ value: "ru", label: "Russia" },
	];
	const ownerOptions = $derived([
		{ value: "nobody", label: "Nobody" },
		...people.map((person) => ({ value: person.id, label: person.name })),
	]);

	const errorsOf = (name: string) =>
		errors[name]?.map((message) => ({ message }));

	function failed(result: Record<string, unknown> | undefined) {
		errors = (result?.errors as Record<string, string[]>) ?? {};
	}

	function sheetOpen(sheet: AddDeviceSheet) {
		return {
			get open() {
				return sheets.addDevice === sheet;
			},
			set open(value: boolean) {
				errors = {};
				sheets.addDevice = value ? sheet : null;
			},
		};
	}

	const blindSheet = sheetOpen("blind");
	const printerSheet = sheetOpen("printer");
	const melCloudSheet = sheetOpen("melcloud");
	const dreameSheet = sheetOpen("dreame");
	const zigbeeSheet = sheetOpen("zigbee");
	const linkySheet = sheetOpen("linky");
	const cameraSheet = sheetOpen("camera");
	const frigateSheet = sheetOpen("frigate");
	const espHomeSheet = sheetOpen("esphome");
	const editSheet = {
		get open() {
			return sheets.editDeviceId !== null;
		},
		set open(value: boolean) {
			if (!value) {
				sheets.editDeviceId = null;
			}
			errors = {};
			confirmingRemove = false;
		},
	};
</script>

{#snippet recordingFields(
	prefix: string,
	options: { record?: boolean; retentionDays?: number } | null,
)}
	<Field.Field orientation="horizontal">
		<Checkbox
			id="{prefix}-record"
			name="record"
			value="true"
			checked={options?.record ?? true}
		/>
		<Field.Label for="{prefix}-record"
			>Record on the server, in five-minute files</Field.Label
		>
	</Field.Field>
	{@render text(prefix, "retentionDays", "Keep recordings for (days)", {
		value: String(options?.retentionDays ?? 7),
		numeric: true,
		description:
			"Older files are deleted. A 1080p camera fills roughly 20 GB a day.",
	})}
{/snippet}

{#snippet espHomeFields(prefix: string, objectId: string)}
	{@render text(prefix, "objectId", "Climate id", {
		value: objectId,
		placeholder: "living_room",
		description:
			"The climate's name in the adapter's YAML, in lowercase with underscores. Its web page shows it.",
	})}
	{@render text(prefix, "username", "Web server username", { optional: true })}
	{@render text(prefix, "password", "Web server password", {
		secret: true,
		optional: true,
		description:
			"Only if the adapter's web_server has auth. Leave empty to keep.",
	})}
{/snippet}

{#snippet roomPicker(prefix: string, value: string | null)}
	<Field.Field>
		<Field.Label for="{prefix}-room">Room</Field.Label>
		<Picker
			id="{prefix}-room"
			name="roomId"
			label="Room"
			options={roomOptions}
			value={value ?? "house"}
		/>
		<Field.Error errors={errorsOf("roomId")} />
	</Field.Field>
{/snippet}

{#snippet text(
	prefix: string,
	name: string,
	label: string,
	options: {
		value?: string;
		placeholder?: string;
		secret?: boolean;
		optional?: boolean;
		numeric?: boolean;
		description?: string;
	} = {},
)}
	<Field.Field>
		<Field.Label for="{prefix}-{name}">{label}</Field.Label>
		<Input
			id="{prefix}-{name}"
			{name}
			value={options.value ?? ""}
			placeholder={options.placeholder}
			type={options.secret ? "password" : "text"}
			inputmode={options.numeric ? "decimal" : undefined}
			autocomplete="off"
			required={!options.optional}
			class="h-11"
		/>
		{#if options.description}
			<Field.Description>{options.description}</Field.Description>
		{/if}
		<Field.Error errors={errorsOf(name)} />
	</Field.Field>
{/snippet}

{#snippet dataPoints(
	prefix: string,
	values: { controlDp: number; positionDp: number; positionStateDp: number },
)}
	<Field.Field>
		<Field.Label for="{prefix}-control-dp">Data points</Field.Label>
		<div class="grid grid-cols-3 gap-3">
			{#each [["controlDp", "Commands"], ["positionDp", "Set position"], ["positionStateDp", "Position"]] as const as [name, label] (name)}
				<div class="flex flex-col gap-1">
					<Input
						id={name === "controlDp"
							? `${prefix}-control-dp`
							: `${prefix}-${name}`}
						{name}
						type="number"
						inputmode="numeric"
						min="1"
						max="255"
						value={values[name]}
						aria-label="{label} data point"
						class="h-11"
					/>
					<span class="text-muted-foreground text-xs">{label}</span>
				</div>
			{/each}
		</div>
		<Field.Description
			>Most blinds use 1, 2 and 3. Others list theirs in the Tuya device
			details.</Field.Description
		>
		<Field.Error
			errors={[
				...(errorsOf("controlDp") ?? []),
				...(errorsOf("positionDp") ?? []),
				...(errorsOf("positionStateDp") ?? []),
			]}
		/>
	</Field.Field>
{/snippet}

{#snippet tuyaFields(prefix: string, device: Device | undefined)}
	<Field.Field>
		<Field.Label for="{prefix}-version">Protocol version</Field.Label>
		<Picker
			id="{prefix}-version"
			name="protocolVersion"
			label="Protocol version"
			options={versionOptions}
			value={device?.protocolVersion ?? "3.3"}
		/>
	</Field.Field>
	{@render dataPoints(prefix, {
		controlDp: device?.controlDp ?? 1,
		positionDp: device?.positionDp ?? 2,
		positionStateDp: device?.positionStateDp ?? 3,
	})}
	<Field.Field orientation="horizontal">
		<Checkbox
			id="{prefix}-inverted"
			name="inverted"
			value="true"
			checked={device?.inverted ?? false}
		/>
		<Field.Label for="{prefix}-inverted"
			>It reports 100% when closed</Field.Label
		>
	</Field.Field>
{/snippet}

<ResponsiveSheet
	bind:open={sheets.pickDevice}
	title="Add a device"
	description="Pick what to connect. Each one walks you through what it needs."
	wide
>
	<ul class="grid gap-2 pb-6 sm:grid-cols-2">
		{#each addDeviceOptions as option (option.title)}
			<li>
				<button
					type="button"
					class="hover:bg-muted/60 border-border flex h-full min-h-16 w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors"
					onclick={() => {
						sheets.pickDevice = false;
						errors = {};
						sheets.addDevice = option.sheet;
					}}
				>
					<span
						class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
						aria-hidden="true"
					>
						<option.icon class="size-5" />
					</span>
					<span class="min-w-0">
						<span class="block font-medium">{option.title}</span>
						<span class="text-muted-foreground block text-sm"
							>{option.description}</span
						>
					</span>
				</button>
			</li>
		{/each}
	</ul>
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={blindSheet.open}
	title="Add a Tuya blind"
	description="Give the blind a fixed IP in your router so it stays reachable."
>
	<form
		method="POST"
		action="{devicesPath}?/addTuya"
		class="flex flex-col gap-4 pb-6"
		use:enhance={enhanceToast({
			loading: "Adding the blind",
			success: "Blind added. It's read in a moment.",
			reset: true,
			onFailure: failed,
			onSuccess: () => {
				blindSheet.open = false;
			},
		})}
	>
		{@render text("blind", "name", "Name", { placeholder: "Living room" })}
		{@render roomPicker("blind", null)}
		{@render text("blind", "host", "IP address", {
			placeholder: "192.168.1.40",
			numeric: true,
		})}
		{@render text("blind", "externalId", "Device ID")}
		{@render text("blind", "localKey", "Local key", {
			secret: true,
			description: "Stored encrypted, never shown again.",
		})}
		{@render tuyaFields("blind", undefined)}
		<Button type="submit" class="h-11 rounded-xl px-5"
			><PlusIcon />Add blind</Button
		>
	</form>
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={printerSheet.open}
	title="Add a Bambu Lab printer"
	description="On the printer: Settings, Network for the IP and access code, Settings, Device for the serial number."
>
	<form
		method="POST"
		action="{devicesPath}?/addBambu"
		class="flex flex-col gap-4 pb-6"
		use:enhance={enhanceToast({
			loading: "Adding the printer",
			success: "Printer added. It's read in a moment.",
			reset: true,
			onFailure: failed,
			onSuccess: () => {
				printerSheet.open = false;
			},
		})}
	>
		{@render text("printer", "name", "Name", { placeholder: "P1S" })}
		{@render roomPicker("printer", null)}
		{@render text("printer", "host", "IP address", {
			placeholder: "192.168.1.50",
			numeric: true,
		})}
		{@render text("printer", "externalId", "Serial number")}
		{@render text("printer", "accessCode", "Access code", {
			secret: true,
			description: "Stored encrypted, never shown again.",
		})}
		<Button type="submit" class="h-11 rounded-xl px-5"
			><PlusIcon />Add printer</Button
		>
	</form>
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={melCloudSheet.open}
	title="Mitsubishi (MELCloud)"
	description={melCloudEmail
		? `Connected as ${melCloudEmail}. Units are read every two minutes.`
		: "Sign in with the account the MELCloud app uses. The password is stored encrypted."}
>
	{#if melCloudEmail}
		<div class="flex flex-col gap-3 pb-6">
			<form
				method="POST"
				action="{devicesPath}?/syncMelCloud"
				use:enhance={enhanceToast({
					loading: "Looking for units",
					success: (result) =>
						`Found ${result?.imported ?? 0} new ${result?.imported === 1 ? "unit" : "units"}.`,
				})}
			>
				<Button
					type="submit"
					variant="outline"
					class="h-11 w-full rounded-xl px-5"
					><RefreshCwIcon />Find new units</Button
				>
			</form>
			<form
				method="POST"
				action="{devicesPath}?/disconnectMelCloud"
				use:enhance={enhanceToast({
					loading: "Disconnecting MELCloud",
					success: "MELCloud disconnected.",
					onSuccess: () => {
						melCloudSheet.open = false;
					},
				})}
			>
				<Button
					type="submit"
					variant="destructive"
					class="h-11 w-full rounded-xl px-5"><UnplugIcon />Disconnect</Button
				>
			</form>
		</div>
	{:else}
		<form
			method="POST"
			action="{devicesPath}?/connectMelCloud"
			class="flex flex-col gap-4 pb-6"
			use:enhance={enhanceToast({
				loading: "Signing in to MELCloud",
				success: (result) =>
					`Connected. Found ${result?.imported ?? 0} ${result?.imported === 1 ? "unit" : "units"}.`,
				onFailure: failed,
				onSuccess: () => {
					melCloudSheet.open = false;
				},
			})}
		>
			{@render text("melcloud", "email", "Email")}
			{@render text("melcloud", "password", "Password", { secret: true })}
			<Button type="submit" class="h-11 rounded-xl px-5"
				><CheckIcon />Connect</Button
			>
		</form>
	{/if}
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={dreameSheet.open}
	title="Dreame robot vacuums"
	description={dreameEmail
		? `Connected as ${dreameEmail}. Robots are read every two minutes.`
		: "Sign in with the account the Dreamehome app uses. The password is stored encrypted. Dreame may refuse anything but its own app."}
>
	{#if dreameEmail}
		<div class="flex flex-col gap-3 pb-6">
			<form
				method="POST"
				action="{devicesPath}?/syncDreame"
				use:enhance={enhanceToast({
					loading: "Looking for robots",
					success: (result) =>
						`Found ${result?.imported ?? 0} new ${result?.imported === 1 ? "robot" : "robots"}.`,
				})}
			>
				<Button
					type="submit"
					variant="outline"
					class="h-11 w-full rounded-xl px-5"
					><RefreshCwIcon />Find new robots</Button
				>
			</form>
			<form
				method="POST"
				action="{devicesPath}?/disconnectDreame"
				use:enhance={enhanceToast({
					loading: "Disconnecting Dreame",
					success: "Dreame disconnected.",
					onSuccess: () => {
						dreameSheet.open = false;
					},
				})}
			>
				<Button
					type="submit"
					variant="destructive"
					class="h-11 w-full rounded-xl px-5"><UnplugIcon />Disconnect</Button
				>
			</form>
		</div>
	{:else}
		<form
			method="POST"
			action="{devicesPath}?/connectDreame"
			class="flex flex-col gap-4 pb-6"
			use:enhance={enhanceToast({
				loading: "Signing in to Dreame",
				success: (result) =>
					`Connected. Found ${result?.imported ?? 0} ${result?.imported === 1 ? "robot" : "robots"}.`,
				onFailure: failed,
				onSuccess: () => {
					dreameSheet.open = false;
				},
			})}
		>
			{@render text("dreame", "email", "Email")}
			{@render text("dreame", "password", "Password", { secret: true })}
			<Field.Field>
				<Field.Label for="dreame-region">Region</Field.Label>
				<Picker
					id="dreame-region"
					name="region"
					label="Region"
					options={regionOptions}
					value="eu"
				/>
				<Field.Error errors={errorsOf("region")} />
			</Field.Field>
			<Button type="submit" class="h-11 rounded-xl px-5"
				><CheckIcon />Connect</Button
			>
		</form>
	{/if}
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={zigbeeSheet.open}
	title="Zigbee (Zigbee2MQTT)"
	description={brokerUrl
		? `Listening on ${brokerUrl}. Pair devices in Zigbee2MQTT: they show up here on their own.`
		: "The MQTT broker Zigbee2MQTT publishes to, often Mosquitto on the same server. The password is stored encrypted."}
>
	{#if brokerUrl}
		<div class="flex flex-col gap-3 pb-6">
			<form
				method="POST"
				action="{devicesPath}?/syncBroker"
				use:enhance={enhanceToast({
					loading: "Asking Zigbee2MQTT again",
					success: "Asked. New devices show up within a few seconds.",
				})}
			>
				<Button
					type="submit"
					variant="outline"
					class="h-11 w-full rounded-xl px-5"
					><RefreshCwIcon />Find new devices</Button
				>
			</form>
			<form
				method="POST"
				action="{devicesPath}?/disconnectBroker"
				use:enhance={enhanceToast({
					loading: "Disconnecting the broker",
					success: "Broker disconnected.",
					onSuccess: () => {
						zigbeeSheet.open = false;
					},
				})}
			>
				<Button
					type="submit"
					variant="destructive"
					class="h-11 w-full rounded-xl px-5"><UnplugIcon />Disconnect</Button
				>
			</form>
		</div>
	{:else}
		<form
			method="POST"
			action="{devicesPath}?/connectBroker"
			class="flex flex-col gap-4 pb-6"
			use:enhance={enhanceToast({
				loading: "Connecting to the broker",
				success: "Connected. Zigbee devices show up within a few seconds.",
				onFailure: failed,
				onSuccess: () => {
					zigbeeSheet.open = false;
				},
			})}
		>
			{@render text("zigbee", "url", "Broker address", {
				placeholder: "mqtt://192.168.1.10:1883",
			})}
			{@render text("zigbee", "username", "Username", { optional: true })}
			{@render text("zigbee", "password", "Password", {
				secret: true,
				optional: true,
			})}
			{@render text("zigbee", "zigbeeTopic", "Zigbee2MQTT base topic", {
				value: "zigbee2mqtt",
			})}
			<Button type="submit" class="h-11 rounded-xl px-5"
				><CheckIcon />Connect</Button
			>
		</form>
	{/if}
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={linkySheet.open}
	title="Linky (Enedis online)"
	description="No hardware: Enedis's daily use, a day behind, through conso.boris.sh. Sign in there with your Enedis account (Enedis holds every Linky's readings, whoever your supplier is, Engie included), allow it, and copy the token. For live power, use the ZLinky_TIC Zigbee reader instead."
>
	<form
		method="POST"
		action="{devicesPath}?/addLinky"
		class="flex flex-col gap-4 pb-6"
		use:enhance={enhanceToast({
			loading: "Adding the Linky",
			success: "Added. The last year comes in within a minute.",
			onFailure: failed,
			onSuccess: () => {
				linkySheet.open = false;
			},
		})}
	>
		{@render text("linky", "name", "Name", { value: "Linky" })}
		{@render roomPicker("linky", null)}
		{@render text("linky", "externalId", "PRM", {
			placeholder: "14 digits",
			numeric: true,
			description:
				"On your bill, or on the meter: press + until it shows the PRM.",
		})}
		{@render text("linky", "token", "Token", {
			secret: true,
			description: "Stored encrypted, never shown again.",
		})}
		<Button type="submit" class="h-11 rounded-xl px-5"
			><PlusIcon />Add the Linky</Button
		>
	</form>
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={cameraSheet.open}
	title="Add a camera"
	description="Any camera with local RTSP (Tapo with a camera account, Reolink). The server keeps the live view and, if you want, records it. The address is stored encrypted."
>
	<form
		method="POST"
		action="{devicesPath}?/addCamera"
		class="flex flex-col gap-4 pb-6"
		use:enhance={enhanceToast({
			loading: "Adding the camera",
			success: "Added. The live view starts within a minute.",
			onFailure: failed,
			onSuccess: () => {
				cameraSheet.open = false;
			},
		})}
	>
		{@render text("camera", "name", "Name", { placeholder: "Front door" })}
		{@render roomPicker("camera", null)}
		{@render text("camera", "url", "RTSP address", {
			secret: true,
			placeholder: "rtsp://user:password@192.168.1.60:554/stream1",
			description: "Tapo: stream1 is full quality, stream2 the small one.",
		})}
		{@render recordingFields("camera", null)}
		<Button type="submit" class="h-11 rounded-xl px-5"
			><PlusIcon />Add the camera</Button
		>
	</form>
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={frigateSheet.open}
	title="Frigate"
	description={frigateUrl
		? `Connected to ${frigateUrl}. Its cameras, events and clips show up here; detections come through the MQTT broker.`
		: "Frigate's internal address (port 5000). Its cameras come in as devices; with the MQTT broker connected, new detections push a notification."}
>
	{#if frigateUrl}
		<div class="flex flex-col gap-3 pb-6">
			<form
				method="POST"
				action="{devicesPath}?/syncFrigate"
				use:enhance={enhanceToast({
					loading: "Asking Frigate",
					success: (result) =>
						`Frigate has ${result?.imported ?? 0} ${result?.imported === 1 ? "camera" : "cameras"}.`,
				})}
			>
				<Button
					type="submit"
					variant="outline"
					class="h-11 w-full rounded-xl px-5"
					><RefreshCwIcon />Find new cameras</Button
				>
			</form>
			<form
				method="POST"
				action="{devicesPath}?/disconnectFrigate"
				use:enhance={enhanceToast({
					loading: "Disconnecting Frigate",
					success: "Frigate disconnected.",
					onSuccess: () => {
						frigateSheet.open = false;
					},
				})}
			>
				<Button
					type="submit"
					variant="destructive"
					class="h-11 w-full rounded-xl px-5"><UnplugIcon />Disconnect</Button
				>
			</form>
		</div>
	{:else}
		<form
			method="POST"
			action="{devicesPath}?/connectFrigate"
			class="flex flex-col gap-4 pb-6"
			use:enhance={enhanceToast({
				loading: "Connecting to Frigate",
				success: (result) =>
					`Connected. Found ${result?.imported ?? 0} ${result?.imported === 1 ? "camera" : "cameras"}.`,
				onFailure: failed,
				onSuccess: () => {
					frigateSheet.open = false;
				},
			})}
		>
			{@render text("frigate", "url", "Address", {
				placeholder: "http://192.168.1.10:5000",
			})}
			{@render text("frigate", "notifyLabels", "Notify for", {
				value: "person",
				description: "Comma-separated Frigate labels, like person, car, dog.",
			})}
			<Button type="submit" class="h-11 rounded-xl px-5"
				><CheckIcon />Connect</Button
			>
		</form>
	{/if}
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={espHomeSheet.open}
	title="Mitsubishi through ESPHome"
	description="An ESP32 on the indoor unit's CN105 port, running ESPHome with the CN105 climate and web_server. Driven over your network, no cloud."
>
	<form
		method="POST"
		action="{devicesPath}?/addEspHome"
		class="flex flex-col gap-4 pb-6"
		use:enhance={enhanceToast({
			loading: "Adding the unit",
			success: "Added.",
			onFailure: failed,
			onSuccess: () => {
				espHomeSheet.open = false;
			},
		})}
	>
		{@render text("esphome", "name", "Name", { placeholder: "Living room" })}
		{@render roomPicker("esphome", null)}
		{@render text("esphome", "host", "IP address", {
			placeholder: "192.168.1.70",
			numeric: true,
		})}
		{@render espHomeFields("esphome", "")}
		<Button type="submit" class="h-11 rounded-xl px-5"
			><PlusIcon />Add the unit</Button
		>
	</form>
</ResponsiveSheet>

<ResponsiveSheet bind:open={editSheet.open} title="Edit {editing?.name ?? ''}">
	{#if editing}
		<form
			method="POST"
			action="{devicesPath}?/{editActions[editing.kind]}"
			class="flex flex-col gap-4"
			use:enhance={enhanceToast({
				loading: "Saving",
				success: "Saved.",
				onFailure: failed,
				onSuccess: () => {
					editSheet.open = false;
				},
			})}
		>
			<input type="hidden" name="id" value={editing.id} />
			{@render text("edit", "name", "Name", { value: editing.name })}
			{@render roomPicker("edit", editing.roomId)}
			{#if editing.kind === "app"}
				<Field.Field>
					<Field.Label for="edit-owner">Whose is it</Field.Label>
					<Picker
						id="edit-owner"
						name="ownerId"
						label="Owner"
						options={ownerOptions}
						value={editing.ownerId ?? "nobody"}
					/>
					<Field.Error errors={errorsOf("ownerId")} />
				</Field.Field>
			{/if}
			{#if editing.kind === "linky"}
				{@render text("edit", "externalId", "PRM", {
					value: editing.externalId,
					numeric: true,
					description:
						"On your bill, or on the meter: press + until it shows the PRM.",
				})}
				{@render text("edit", "token", "Token", {
					secret: true,
					optional: true,
					placeholder: "Unchanged",
					description:
						"Leave empty to keep the current one. A new one comes from conso.boris.sh.",
				})}
			{/if}
			{#if editing.kind === "esphome-climate"}
				{@render text("edit", "host", "IP address", {
					value: editing.host ?? "",
					numeric: true,
				})}
				{@render espHomeFields("edit", editing.options?.objectId ?? "")}
			{/if}
			{#if editing.kind === "camera"}
				{@render text("edit", "url", "RTSP address", {
					secret: true,
					optional: true,
					placeholder: "Unchanged",
					description: "Leave empty to keep the current one.",
				})}
				{@render recordingFields("edit", editing.options)}
			{/if}
			{#if editing.kind === "tuya-cover" || editing.kind === "bambu-printer"}
				{@render text("edit", "host", "IP address", {
					value: editing.host ?? "",
					numeric: true,
				})}
			{/if}
			{#if editing.kind === "tuya-cover"}
				{@render text("edit", "localKey", "Local key", {
					secret: true,
					optional: true,
					placeholder: "Unchanged",
					description: "Leave empty to keep the current one.",
				})}
				{@render tuyaFields("edit", editing)}
			{:else if editing.kind === "bambu-printer"}
				{@render text("edit", "accessCode", "Access code", {
					secret: true,
					optional: true,
					placeholder: "Unchanged",
					description: "Leave empty to keep the current one.",
				})}
			{/if}
			<div class="flex flex-wrap gap-3">
				<Button type="submit" class="h-11 rounded-xl px-5"
					><CheckIcon />Save</Button
				>
				{#if integration}
					<Button
						variant="outline"
						class="h-11 rounded-xl px-5"
						onclick={() => {
							const target = integration?.sheet ?? null;
							editSheet.open = false;
							sheets.addDevice = target;
						}}><SettingsIcon />{integration?.label}</Button
					>
				{/if}
			</div>
		</form>
		<div class="border-border mt-6 border-t pt-4 pb-6">
			{#if confirmingRemove}
				<form
					method="POST"
					action="{devicesPath}?/remove"
					class="flex flex-col gap-3"
					use:enhance={enhanceToast({
						loading: "Removing",
						success: `${editing.name} removed.`,
						onSuccess: () => {
							editSheet.open = false;
						},
					})}
				>
					<input type="hidden" name="id" value={editing.id} />
					<p class="text-sm">
						{editing.kind.startsWith("melcloud") ||
						editing.kind.startsWith("zigbee-") ||
						editing.kind === "dreame-vacuum"
							? "Finding new devices brings it back."
							: editing.kind === "app"
								? "Add it again from Account, This device, on it."
								: "Its key is deleted. Add it again to control it."}
					</p>
					<div class="flex gap-3">
						<Button
							type="submit"
							variant="destructive"
							class="h-11 flex-1 rounded-xl"
							><Trash2Icon />Remove {editing.name}</Button
						>
						<Button
							variant="secondary"
							class="h-11 rounded-xl px-5"
							onclick={() => (confirmingRemove = false)}>Keep it</Button
						>
					</div>
				</form>
			{:else}
				<Button
					variant="ghost"
					class="text-destructive h-11 rounded-xl px-5"
					onclick={() => (confirmingRemove = true)}
					><Trash2Icon />Remove this device</Button
				>
			{/if}
		</div>
	{/if}
</ResponsiveSheet>
