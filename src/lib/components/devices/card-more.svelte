<script lang="ts">
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";

	import IconButton from "#lib/components/icon-button.svelte";

	interface Props {
		name: string;
		onclick?: () => void;
	}

	const { name, onclick }: Props = $props();
</script>

{#if onclick}
	<IconButton
		label="More for {name}"
		icon={EllipsisIcon}
		class="text-muted-foreground relative -mr-2 shrink-0"
		{onclick}
	/>
{/if}
