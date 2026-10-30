<script lang="ts">
	import { enhance } from "$app/forms";
	import CheckIcon from "@lucide/svelte/icons/check";
	import { untrack } from "svelte";

	import { checksFor, type StateTest } from "#lib/automations.js";
	import StateTestEditor from "#lib/components/automations/state-test-editor.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import type { PluginCard } from "#lib/plugins.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Props {
		open: boolean;
		devices: { id: string; card: PluginCard; name: string }[];
	}

	let { open = $bindable(), devices }: Props = $props();

	let test = $state<StateTest>({ deviceId: "", check: "on", value: null });

	$effect(() => {
		if (open) {
			untrack(() => {
				const first = devices.find(
					(device) => checksFor(device.card).length > 0,
				);
				test = {
					deviceId: first?.id ?? "",
					check: first ? (checksFor(first.card)[0] ?? "on") : "on",
					value: null,
				};
			});
		}
	});
</script>

<ResponsiveSheet
	bind:open
	title="Tell me when"
	description="A notification on your devices only, when a device gets there."
>
	<form
		method="POST"
		action="?/addRule"
		class="flex flex-col gap-4 pb-6"
		use:enhance={enhanceToast({
			loading: "Saving",
			success: "You'll be told.",
			onSuccess: () => {
				open = false;
			},
		})}
	>
		<input type="hidden" name="test" value={JSON.stringify(test)} />
		{#key open}
			<StateTestEditor id="rule" bind:test {devices} />
		{/key}
		<Button type="submit" class="h-11 rounded-xl px-5"><CheckIcon />Save</Button
		>
	</form>
</ResponsiveSheet>
