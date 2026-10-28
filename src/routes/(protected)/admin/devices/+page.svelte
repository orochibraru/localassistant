<script lang="ts">
	import { enhance } from "$app/forms";
	import BlindsIcon from "@lucide/svelte/icons/blinds";
	import CheckIcon from "@lucide/svelte/icons/check";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import ThermometerIcon from "@lucide/svelte/icons/thermometer";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import UnplugIcon from "@lucide/svelte/icons/unplug";

	import ItemMenu from "#lib/components/item-menu.svelte";
	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { tuyaProtocolVersions } from "#lib/devices.js";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();

	type Device = (typeof data.devices)[number];

	let adding = $state(false);
	let editing = $state<Device | undefined>();
	let editOpen = $state(false);
	let editErrors = $state<Record<string, string[]>>({});
	let tuyaErrors = $state<Record<string, string[]>>({});
	let melCloudErrors = $state<Record<string, string[]>>({});

	const errorsOf = (errors: Record<string, string[]>, name: string) =>
		errors[name]?.map((message) => ({ message }));

	const kindLabels: Record<Device["kind"], string> = {
		"tuya-cover": "Tuya blind",
		"melcloud-ata": "Air-to-air heat pump",
		"melcloud-atw": "Air-to-water heat pump",
	};

	function startEdit(device: Device) {
		editing = device;
		editErrors = {};
		editOpen = true;
	}
</script>

{#snippet dataPoints(
	prefix: string,
	values: { controlDp: number; positionDp: number; positionStateDp: number },
	errors: Record<string, string[]>,
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
				...(errorsOf(errors, "controlDp") ?? []),
				...(errorsOf(errors, "positionDp") ?? []),
				...(errorsOf(errors, "positionStateDp") ?? []),
			]}
		/>
	</Field.Field>
{/snippet}

<div class="grid gap-6 lg:grid-cols-[minmax(20rem,28rem)_1fr] lg:items-start">
	<div class="flex flex-col gap-6">
		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">Mitsubishi (MELCloud)</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					{data.melCloudEmail
						? `Connected as ${data.melCloudEmail}. Units are read every two minutes.`
						: "Sign in with the account the MELCloud app uses. The password is stored encrypted."}
				</p>
			</div>
			{#if data.melCloudEmail}
				<div class="flex flex-col gap-3 sm:flex-row">
					<form
						method="POST"
						action="?/syncMelCloud"
						use:enhance={enhanceToast({
							loading: "Looking for units",
							success: (result) =>
								`Found ${result?.imported ?? 0} ${result?.imported === 1 ? "unit" : "units"}.`,
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
						action="?/disconnectMelCloud"
						use:enhance={enhanceToast({
							loading: "Disconnecting MELCloud",
							success: "MELCloud disconnected.",
						})}
					>
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
					action="?/connectMelCloud"
					class="flex flex-col gap-4"
					use:enhance={enhanceToast({
						loading: "Signing in to MELCloud",
						success: (result) =>
							`Connected. Found ${result?.imported ?? 0} ${result?.imported === 1 ? "unit" : "units"}.`,
						onFailure: (result) =>
							(melCloudErrors =
								(result?.errors as Record<string, string[]>) ?? {}),
						onSuccess: () => {
							melCloudErrors = {};
						},
					})}
				>
					<Field.Field>
						<Field.Label for="melcloud-email">Email</Field.Label>
						<Input
							id="melcloud-email"
							name="email"
							type="email"
							inputmode="email"
							autocomplete="off"
							required
							class="h-11"
						/>
						<Field.Error errors={errorsOf(melCloudErrors, "email")} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="melcloud-password">Password</Field.Label>
						<Input
							id="melcloud-password"
							name="password"
							type="password"
							autocomplete="off"
							required
							class="h-11"
						/>
						<Field.Error errors={errorsOf(melCloudErrors, "password")} />
					</Field.Field>
					<Button type="submit" class="h-11 self-start rounded-xl px-5"
						><CheckIcon />Connect</Button
					>
				</form>
			{/if}
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
				onclick={() => (adding = true)}><PlusIcon />Add a blind</Button
			>
		</section>
	</div>

	{#if data.devices.length > 0}
		<ul class="glass divide-border divide-y rounded-2xl">
			{#each data.devices as device (device.id)}
				<li>
					<ItemMenu
						title={device.name}
						class="min-h-16 px-3 py-2 md:px-4"
						actions={[
							{
								label: device.kind === "tuya-cover" ? "Edit" : "Rename",
								icon: PencilIcon,
								onSelect: () => startEdit(device),
							},
							{
								label: "Remove",
								icon: Trash2Icon,
								destructive: true,
								form: {
									action: "?/remove",
									fields: { id: device.id },
									loading: "Removing device",
									success: `${device.name} removed.`,
									confirm: {
										title: `Remove ${device.name}?`,
										description:
											device.kind === "tuya-cover"
												? "Its local key is deleted. Add it again to control it."
												: "Find new units brings it back.",
										confirmLabel: "Remove",
									},
								},
							},
						]}
					>
						<div class="flex min-w-0 flex-1 items-center gap-3">
							<span
								class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
								aria-hidden="true"
							>
								{#if device.kind === "tuya-cover"}
									<BlindsIcon class="size-5" />
								{:else}
									<ThermometerIcon class="size-5" />
								{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{device.name}</span>
								<span class="text-muted-foreground block truncate text-sm">
									{kindLabels[device.kind]}{device.host
										? ` at ${device.host}`
										: ""}
								</span>
							</span>
							{#if device.stateError}
								<Badge variant="destructive">Unreachable</Badge>
							{:else if device.state}
								<Badge variant="secondary">Online</Badge>
							{:else}
								<Badge variant="outline">Not read yet</Badge>
							{/if}
						</div>
					</ItemMenu>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<ResponsiveSheet
	bind:open={adding}
	title="Add a Tuya blind"
	description="Give the blind a fixed IP in your router so it stays reachable."
>
	<form
		method="POST"
		action="?/addTuya"
		class="flex flex-col gap-4 pb-6"
		use:enhance={enhanceToast({
			loading: "Adding the blind",
			success: "Blind added. It's read in a moment.",
			reset: true,
			onFailure: (result) =>
				(tuyaErrors = (result?.errors as Record<string, string[]>) ?? {}),
			onSuccess: () => {
				tuyaErrors = {};
				adding = false;
			},
		})}
	>
		<Field.Field>
			<Field.Label for="tuya-name">Name</Field.Label>
			<Input
				id="tuya-name"
				name="name"
				placeholder="Living room"
				required
				class="h-11"
			/>
			<Field.Error errors={errorsOf(tuyaErrors, "name")} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="tuya-host">IP address</Field.Label>
			<Input
				id="tuya-host"
				name="host"
				inputmode="decimal"
				placeholder="192.168.1.40"
				required
				class="h-11"
			/>
			<Field.Error errors={errorsOf(tuyaErrors, "host")} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="tuya-id">Device ID</Field.Label>
			<Input
				id="tuya-id"
				name="externalId"
				autocomplete="off"
				required
				class="h-11"
			/>
			<Field.Error errors={errorsOf(tuyaErrors, "externalId")} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="tuya-key">Local key</Field.Label>
			<Input
				id="tuya-key"
				name="localKey"
				type="password"
				autocomplete="off"
				required
				class="h-11"
			/>
			<Field.Description>Stored encrypted, never shown again.</Field.Description
			>
			<Field.Error errors={errorsOf(tuyaErrors, "localKey")} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="tuya-version">Protocol version</Field.Label>
			<Picker
				id="tuya-version"
				name="protocolVersion"
				label="Protocol version"
				options={tuyaProtocolVersions.map((version) => ({
					value: version,
					label: version,
				}))}
				value="3.3"
			/>
		</Field.Field>
		{@render dataPoints(
			"tuya",
			{ controlDp: 1, positionDp: 2, positionStateDp: 3 },
			tuyaErrors,
		)}
		<Field.Field orientation="horizontal">
			<Checkbox id="tuya-inverted" name="inverted" value="true" />
			<Field.Label for="tuya-inverted">It reports 100% when closed</Field.Label>
		</Field.Field>
		<Button type="submit" class="h-11 rounded-xl px-5"
			><PlusIcon />Add blind</Button
		>
	</form>
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={editOpen}
	title="{editing?.kind === 'tuya-cover' ? 'Edit' : 'Rename'} {editing?.name ??
		''}"
>
	{#if editing}
		<form
			method="POST"
			action={editing.kind === "tuya-cover" ? "?/editTuya" : "?/rename"}
			class="flex flex-col gap-4 pb-6"
			use:enhance={enhanceToast({
				loading: "Saving",
				success: "Saved.",
				onFailure: (result) =>
					(editErrors = (result?.errors as Record<string, string[]>) ?? {}),
				onSuccess: () => {
					editOpen = false;
				},
			})}
		>
			<input type="hidden" name="id" value={editing.id} />
			<Field.Field>
				<Field.Label for="edit-name">Name</Field.Label>
				<Input
					id="edit-name"
					name="name"
					value={editing.name}
					required
					class="h-11"
				/>
				<Field.Error errors={errorsOf(editErrors, "name")} />
			</Field.Field>
			{#if editing.kind === "tuya-cover"}
				<Field.Field>
					<Field.Label for="edit-host">IP address</Field.Label>
					<Input
						id="edit-host"
						name="host"
						inputmode="decimal"
						value={editing.host ?? ""}
						required
						class="h-11"
					/>
					<Field.Error errors={errorsOf(editErrors, "host")} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="edit-key">Local key</Field.Label>
					<Input
						id="edit-key"
						name="localKey"
						type="password"
						autocomplete="off"
						placeholder="Unchanged"
						class="h-11"
					/>
					<Field.Description
						>Leave empty to keep the current one.</Field.Description
					>
					<Field.Error errors={errorsOf(editErrors, "localKey")} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="edit-version">Protocol version</Field.Label>
					<Picker
						id="edit-version"
						name="protocolVersion"
						label="Protocol version"
						options={tuyaProtocolVersions.map((version) => ({
							value: version,
							label: version,
						}))}
						value={editing.protocolVersion ?? "3.3"}
					/>
				</Field.Field>
				{@render dataPoints("edit", editing, editErrors)}
				<Field.Field orientation="horizontal">
					<Checkbox
						id="edit-inverted"
						name="inverted"
						value="true"
						checked={editing.inverted}
					/>
					<Field.Label for="edit-inverted"
						>It reports 100% when closed</Field.Label
					>
				</Field.Field>
			{/if}
			<Button type="submit" class="h-11 rounded-xl px-5"
				><CheckIcon />Save</Button
			>
		</form>
	{/if}
</ResponsiveSheet>
