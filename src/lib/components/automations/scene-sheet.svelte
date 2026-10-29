<script lang="ts">
	import { enhance } from "$app/forms";
	import CameraIcon from "@lucide/svelte/icons/camera";
	import CheckIcon from "@lucide/svelte/icons/check";
	import XIcon from "@lucide/svelte/icons/x";
	import { untrack } from "svelte";

	import CommandEditor from "#lib/components/automations/command-editor.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import Picker from "#lib/components/picker.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import type { DeviceState } from "#lib/devices.js";
	import type { PluginCard } from "#lib/plugins.js";
	import {
		captureCommand,
		type SceneMember,
		startingCommand,
	} from "#lib/scenes.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Props {
		open: boolean;
		editing: { id: string; name: string; members: SceneMember[] } | null;
		devices: { id: string; card: PluginCard; name: string }[];
		states: Record<string, DeviceState | null>;
	}

	let { open = $bindable(), editing, devices, states }: Props = $props();

	let name = $state("");
	let members = $state<SceneMember[]>([]);
	let adding = $state("");

	const settable = $derived(
		devices.filter((device) => startingCommand(device.card) !== null),
	);
	const names = $derived(
		new Map(devices.map((device) => [device.id, device.name])),
	);
	const addOptions = $derived(
		settable
			.filter(
				(device) => !members.some((member) => member.deviceId === device.id),
			)
			.map((device) => ({ value: device.id, label: device.name })),
	);

	$effect(() => {
		const current = editing;
		if (open) {
			untrack(() => {
				name = current?.name ?? "";
				members = current
					? structuredClone($state.snapshot(current.members))
					: [];
				adding = "";
			});
		}
	});

	function now(deviceId: string) {
		const device = settable.find((entry) => entry.id === deviceId);
		return (
			captureCommand(states[deviceId] ?? null) ??
			(device ? startingCommand(device.card) : null)
		);
	}

	function add(deviceId: string) {
		const command = now(deviceId);
		if (command) {
			members.push({ deviceId, command });
		}
		adding = "";
	}

	function captureAll() {
		members = members.map((member) => ({
			deviceId: member.deviceId,
			command:
				captureCommand(states[member.deviceId] ?? null) ?? member.command,
		}));
	}
</script>

<ResponsiveSheet
	bind:open
	wide
	title={editing ? `Edit ${editing.name}` : "New scene"}
	description="One tap sets every device in it; routines can set it too."
>
	<form
		method="POST"
		action="?/save"
		class="flex flex-col gap-6 pb-6"
		use:enhance={enhanceToast({
			loading: "Saving",
			success: () => `${name || "Scene"} saved.`,
			onSuccess: () => {
				open = false;
			},
		})}
	>
		<input type="hidden" name="id" value={editing?.id ?? ""} />
		<input
			type="hidden"
			name="definition"
			value={JSON.stringify({ name, members })}
		/>
		<Field.Field>
			<Field.Label for="scene-name">Name</Field.Label>
			<Input
				id="scene-name"
				bind:value={name}
				placeholder="Movie night"
				required
				class="h-11"
			/>
		</Field.Field>

		<Field.Set>
			<Field.Legend>Sets</Field.Legend>
			<ul class="flex flex-col gap-3">
				{#each members as member, index (member.deviceId)}
					<li class="bg-secondary/50 flex flex-col gap-3 rounded-2xl p-3">
						<div class="flex items-center gap-2">
							<span class="min-w-0 flex-1 truncate font-medium"
								>{names.get(member.deviceId) ?? "A removed device"}</span
							>
							<IconButton
								label="Take {names.get(member.deviceId) ?? 'it'} out"
								icon={XIcon}
								onclick={() => members.splice(index, 1)}
							/>
						</div>
						<CommandEditor id="member-{index}" bind:command={member.command} />
					</li>
				{/each}
			</ul>
			{#if addOptions.length > 0}
				<Field.Field>
					<Field.Label for="scene-add">Add a device</Field.Label>
					<Picker
						id="scene-add"
						name=""
						label="Add a device"
						options={addOptions}
						value={adding}
						onPick={add}
						placeholder="Pick one: it starts the way it is now"
						search={{
							placeholder: "Search devices",
							empty: "No device matches.",
						}}
					/>
				</Field.Field>
			{/if}
			{#if members.length > 0}
				<Button
					type="button"
					variant="outline"
					class="h-11 self-start rounded-xl px-5"
					onclick={captureAll}><CameraIcon />Use how they are now</Button
				>
			{/if}
		</Field.Set>

		<Button type="submit" class="h-11 rounded-xl px-5"><CheckIcon />Save</Button
		>
	</form>
</ResponsiveSheet>
