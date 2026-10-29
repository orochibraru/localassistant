<script lang="ts">
	import { page } from "$app/state";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import IconButton from "#lib/components/icon-button.svelte";
	import { useSheets } from "#lib/sheets.svelte.js";

	interface Props {
		id: string;
		name: string;
	}

	const { id, name }: Props = $props();

	const sheets = useSheets();
	const shown = $derived(
		page.data.isAdmin === true && page.route.id !== "/(protected)/panel",
	);
</script>

{#if shown}
	<IconButton
		label="Settings for {name}"
		icon={SettingsIcon}
		class="text-muted-foreground relative -mr-2 shrink-0"
		onclick={() => (sheets.editDeviceId = id)}
	/>
{/if}
