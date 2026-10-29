<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import UnplugIcon from "@lucide/svelte/icons/unplug";

	import { pluginIconComponents } from "#lib/components/devices/device-kinds.js";
	import PluginFields from "#lib/components/devices/plugin-fields.svelte";
	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import type { DeviceRow } from "#lib/dto/device.js";
	import { type HouseFloor, type HouseRoom, roomLabels } from "#lib/house.js";
	import {
		type KindCatalog,
		kindInfo,
		type PluginSetup,
	} from "#lib/plugins.js";
	import { useSheets } from "#lib/sheets.svelte.js";
	import { enhanceToast } from "#lib/toast.js";

	type Device = Omit<DeviceRow, "state">;

	interface Props {
		devices: Device[];
		rooms: HouseRoom[];
		floors: HouseFloor[];
		setups: PluginSetup[];
		kinds: KindCatalog;
		brokerUrl: string | null;
		people: { id: string; name: string }[];
	}

	const { devices, rooms, floors, setups, kinds, brokerUrl, people }: Props =
		$props();

	const sheets = useSheets();
	const devicesPath = resolve("/(protected)/devices");

	let errors = $state<Record<string, string[]>>({});
	let confirmingRemove = $state(false);
	let changingConnection = $state(false);

	const editing = $derived(
		devices.find((device) => device.id === sheets.editDeviceId),
	);
	const editingSetup = $derived(
		editing
			? setups.find(
					(setup) => setup.id === kindInfo(kinds, editing.kind).plugin,
				)
			: undefined,
	);
	const current = $derived(
		setups.find((setup) => setup.id === sheets.addDevice),
	);
	const needsBroker = $derived(
		current?.needs.includes("mqtt") === true && brokerUrl === null,
	);
	const roomOptions = $derived([
		{ value: "house", label: "Whole house" },
		...[...roomLabels(rooms, floors)]
			.map(([value, label]) => ({ value, label }))
			.toSorted((first, second) => first.label.localeCompare(second.label)),
	]);
	const ownerOptions = $derived([
		{ value: "nobody", label: "Nobody" },
		...people.map((person) => ({ value: person.id, label: person.name })),
	]);

	const errorsOf = (name: string) =>
		errors[name]?.map((message) => ({ message }));

	function failed(result: Record<string, unknown> | undefined) {
		errors = (result?.errors as Record<string, string[]>) ?? {};
	}

	function found(result: Record<string, unknown> | undefined, noun: string) {
		const count = result?.found;
		return typeof count === "number"
			? `Found ${count} new ${count === 1 ? noun : `${noun}s`}.`
			: "Asked. New devices show up within a few seconds.";
	}

	const pluginSheet = {
		get open() {
			return sheets.addDevice !== null;
		},
		set open(value: boolean) {
			errors = {};
			changingConnection = false;
			if (!value) {
				sheets.addDevice = null;
			}
		},
	};
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

{#snippet nameField(prefix: string, value: string, placeholder?: string)}
	<Field.Field>
		<Field.Label for="{prefix}-name">Name</Field.Label>
		<Input
			id="{prefix}-name"
			name="name"
			{value}
			{placeholder}
			autocomplete="off"
			required
			class="h-11"
		/>
		<Field.Error errors={errorsOf("name")} />
	</Field.Field>
{/snippet}

<ResponsiveSheet
	bind:open={sheets.pickDevice}
	title="Add a device"
	description="Pick what to connect. Each one walks you through what it needs."
	wide
>
	<ul class="grid gap-2 pb-4 sm:grid-cols-2">
		{#each setups as setup (setup.id)}
			{@const Icon = pluginIconComponents[setup.icon]}
			<li>
				<button
					type="button"
					class="hover:bg-muted/60 border-border flex h-full min-h-16 w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors"
					onclick={() => {
						sheets.pickDevice = false;
						errors = {};
						sheets.addDevice = setup.id;
					}}
				>
					<span
						class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
						aria-hidden="true"
					>
						<Icon class="size-5" />
					</span>
					<span class="min-w-0">
						<span class="block font-medium">{setup.name}</span>
						<span class="text-muted-foreground block text-sm"
							>{setup.description}</span
						>
					</span>
				</button>
			</li>
		{/each}
	</ul>
	<div class="pb-6">
		<Button
			href={resolve("/(protected)/admin/plugins")}
			variant="outline"
			class="h-11 w-full rounded-xl px-5"
			onclick={() => (sheets.pickDevice = false)}
			><PuzzleIcon />Get more integrations</Button
		>
	</div>
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={pluginSheet.open}
	title={current?.device && !current.connection
		? current.device.title
		: (current?.name ?? "")}
	description={needsBroker
		? "This needs the household's MQTT broker, often Mosquitto on the same server. Connect it once: other integrations share it."
		: (current?.connection?.description ??
			current?.device?.description ??
			current?.automatic ??
			"")}
>
	{#if current}
		<div class="flex flex-col gap-6 pb-6">
			{#if needsBroker}
				<form
					method="POST"
					action="{devicesPath}?/connectBroker"
					class="flex flex-col gap-4"
					use:enhance={enhanceToast({
						loading: "Connecting to the broker",
						success: "Broker connected.",
						onFailure: failed,
					})}
				>
					{#each [{ name: "url", label: "Broker address", placeholder: "mqtt://192.168.1.10:1883", optional: false, secret: false }, { name: "username", label: "Username", placeholder: undefined, optional: true, secret: false }, { name: "password", label: "Password", placeholder: undefined, optional: true, secret: true }] as input (input.name)}
						<Field.Field>
							<Field.Label for="broker-{input.name}">{input.label}</Field.Label>
							<Input
								id="broker-{input.name}"
								name={input.name}
								placeholder={input.placeholder}
								type={input.secret ? "password" : "text"}
								autocomplete="off"
								required={!input.optional}
								class="h-11"
							/>
							<Field.Error errors={errorsOf(input.name)} />
						</Field.Field>
					{/each}
					<Button type="submit" class="h-11 rounded-xl px-5"
						><CheckIcon />Connect the broker</Button
					>
				</form>
			{:else}
				{#if current.connection}
					{#if current.connected && !changingConnection}
						<p class="text-muted-foreground text-sm">
							{current.connection.connected}
						</p>
						<div class="flex flex-col gap-3">
							{#if current.connection.find}
								<form
									method="POST"
									action="{devicesPath}?/discover"
									use:enhance={enhanceToast({
										loading: "Looking for devices",
										success: (result) => found(result, "device"),
									})}
								>
									<input type="hidden" name="plugin" value={current.id} />
									<Button
										type="submit"
										variant="outline"
										class="h-11 w-full rounded-xl px-5"
										><RefreshCwIcon />{current.connection.find}</Button
									>
								</form>
							{/if}
							<Button
								variant="outline"
								class="h-11 w-full rounded-xl px-5"
								onclick={() => (changingConnection = true)}
								><SettingsIcon />Change the settings</Button
							>
							<form
								method="POST"
								action="{devicesPath}?/disconnect"
								use:enhance={enhanceToast({
									loading: `Disconnecting ${current.name}`,
									success: `${current.name} disconnected.`,
									onSuccess: () => {
										pluginSheet.open = false;
									},
								})}
							>
								<input type="hidden" name="plugin" value={current.id} />
								<Button
									type="submit"
									variant="destructive"
									class="h-11 w-full rounded-xl px-5"
									><UnplugIcon />Disconnect</Button
								>
							</form>
						</div>
					{:else}
						<form
							method="POST"
							action="{devicesPath}?/connect"
							class="flex flex-col gap-4"
							use:enhance={enhanceToast({
								loading: `Connecting ${current.name}`,
								success: (result) => `Connected. ${found(result, "device")}`,
								onFailure: failed,
								onSuccess: () => {
									changingConnection = false;
								},
							})}
						>
							<input type="hidden" name="plugin" value={current.id} />
							<PluginFields
								prefix="connect-{current.id}"
								fields={current.connection.fields}
								values={current.values}
								secretsSet={current.secretsSet}
								{errors}
							/>
							<Button type="submit" class="h-11 rounded-xl px-5"
								><CheckIcon />{current.connected ? "Save" : "Connect"}</Button
							>
						</form>
					{/if}
				{/if}
				{#if current.device}
					{#if current.connection}
						<h3 class="font-semibold">{current.device.title}</h3>
					{/if}
					<form
						method="POST"
						action="{devicesPath}?/add"
						class="flex flex-col gap-4"
						use:enhance={enhanceToast({
							loading: "Adding",
							success: "Added. It's read in a moment.",
							reset: true,
							onFailure: failed,
							onSuccess: () => {
								pluginSheet.open = false;
							},
						})}
					>
						<input type="hidden" name="plugin" value={current.id} />
						{@render nameField(`add-${current.id}`, "")}
						{@render roomPicker(`add-${current.id}`, null)}
						<PluginFields
							prefix="add-{current.id}"
							fields={current.device.fields}
							values={{}}
							secretsSet={[]}
							{errors}
						/>
						<Button type="submit" class="h-11 rounded-xl px-5"
							><PlusIcon />{current.device.submit}</Button
						>
					</form>
				{/if}
				{#if current.automatic && !current.connection && !current.device}
					<p class="text-muted-foreground text-sm">
						Listening on {brokerUrl ?? "the MQTT broker"}.
					</p>
				{/if}
			{/if}
		</div>
	{/if}
</ResponsiveSheet>

<ResponsiveSheet bind:open={editSheet.open} title="Edit {editing?.name ?? ''}">
	{#if editing}
		<form
			method="POST"
			action="{devicesPath}?/{editing.kind === 'app' ? 'editApp' : 'edit'}"
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
			{@render nameField("edit", editing.name)}
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
			{#if editingSetup?.device}
				<PluginFields
					prefix="edit"
					fields={editingSetup.device.fields}
					values={editing.fields}
					secretsSet={editingSetup.device.fields
						.filter((field) => field.type === "secret")
						.map((field) => field.name)}
					{errors}
				/>
			{/if}
			<div class="flex flex-wrap gap-3">
				<Button type="submit" class="h-11 rounded-xl px-5"
					><CheckIcon />Save</Button
				>
				{#if editingSetup?.connection}
					<Button
						variant="outline"
						class="h-11 rounded-xl px-5"
						onclick={() => {
							const target = editingSetup?.id ?? null;
							editSheet.open = false;
							sheets.addDevice = target;
						}}><SettingsIcon />Manage {editingSetup.name}</Button
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
						{editing.kind === "app"
							? "Add it again from Account, This device, on it."
							: editingSetup?.device
								? "Its keys are deleted. Add it again to control it."
								: "Finding new devices brings it back."}
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
