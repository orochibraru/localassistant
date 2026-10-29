<script lang="ts">
	import {
		checksFor,
		measures,
		type StateCheck,
		type StateTest,
	} from "#lib/automations.js";
	import ChoiceRow from "#lib/components/automations/choice-row.svelte";
	import Picker from "#lib/components/picker.svelte";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import type { PluginCard } from "#lib/plugins.js";

	interface Props {
		id: string;
		test: StateTest;
		devices: { id: string; card: PluginCard; name: string }[];
		holds?: boolean;
	}

	let { id, test = $bindable(), devices, holds = false }: Props = $props();

	const watchable = $derived(
		devices.filter((device) => checksFor(device.card).length > 0),
	);
	const card = $derived(
		watchable.find((device) => device.id === test.deviceId)?.card,
	);
	const checks = $derived(card ? checksFor(card) : []);

	const firingLabels: Record<StateCheck, string> = {
		on: "Turns on",
		off: "Turns off",
		open: "Opens",
		closed: "Shuts",
		locked: "Locks",
		unlocked: "Unlocks",
		playing: "Starts playing",
		above: "Goes above",
		below: "Goes below",
		pressed: "Is pressed",
	};
	const holdingLabels: Record<StateCheck, string> = {
		on: "Is on",
		off: "Is off",
		open: "Is open",
		closed: "Is shut",
		locked: "Is locked",
		unlocked: "Is unlocked",
		playing: "Is playing",
		above: "Is above",
		below: "Is below",
		pressed: "Was pressed",
	};

	function pickDevice(deviceId: string) {
		const next = watchable.find((device) => device.id === deviceId);
		const available = next ? checksFor(next.card) : [];
		const check = available.includes(test.check)
			? test.check
			: (available[0] ?? "on");
		test = {
			deviceId,
			check,
			value: measures(check) ? (test.value ?? 0) : null,
		};
	}
</script>

<Picker
	id="{id}-device"
	name=""
	label="Device"
	options={watchable.map((device) => ({
		value: device.id,
		label: device.name,
	}))}
	value={test.deviceId}
	onPick={pickDevice}
	placeholder="Pick a device"
	search={{ placeholder: "Search devices", empty: "No device matches." }}
/>
{#if checks.length > 0}
	<ChoiceRow
		label="When it"
		options={checks
			.filter((check) => !holds || check !== "pressed")
			.map((check) => ({
				value: check,
				label: (holds ? holdingLabels : firingLabels)[check],
			}))}
		value={test.check}
		onChange={(next) => {
			const check = checks.find((entry) => entry === next) ?? test.check;
			test = {
				...test,
				check,
				value: measures(check) ? (test.value ?? 0) : null,
			};
		}}
	/>
{/if}
{#if measures(test.check)}
	<Field.Field>
		<Field.Label for="{id}-value">Value</Field.Label>
		<Input
			id="{id}-value"
			type="number"
			inputmode="decimal"
			step="any"
			value={test.value ?? 0}
			oninput={(event) =>
				(test = {
					...test,
					value: Number.parseFloat(event.currentTarget.value) || 0,
				})}
			class="h-11"
		/>
		<Field.Description
			>A sensor's reading, a meter's watts, a thermostat's room temperature, a
			light's brightness or a blind's position.</Field.Description
		>
	</Field.Field>
{/if}
