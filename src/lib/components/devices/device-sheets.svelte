<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import UnplugIcon from "@lucide/svelte/icons/unplug";

	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { tuyaProtocolVersions } from "#lib/devices.js";
	import type { DeviceRow } from "#lib/dto/device.js";
	import { type HouseFloor, type HouseRoom, roomLabels } from "#lib/house.js";
	import { useSheets } from "#lib/sheets.svelte.js";
	import { enhanceToast } from "#lib/toast.js";

	type Device = Omit<DeviceRow, "state">;

	interface Props {
		devices: Device[];
		rooms: HouseRoom[];
		floors: HouseFloor[];
		melCloudEmail: string | null;
	}

	const { devices, rooms, floors, melCloudEmail }: Props = $props();

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
	};

	const errorsOf = (name: string) =>
		errors[name]?.map((message) => ({ message }));

	function failed(result: Record<string, unknown> | undefined) {
		errors = (result?.errors as Record<string, string[]>) ?? {};
	}

	function sheetOpen(sheet: "blind" | "printer" | "melcloud") {
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
			<Button type="submit" class="h-11 rounded-xl px-5"
				><CheckIcon />Save</Button
			>
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
						{editing.kind.startsWith("melcloud")
							? "Find new units brings it back."
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
