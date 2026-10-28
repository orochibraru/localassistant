<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import { toast } from "svelte-sonner";

	import IconButton from "#lib/components/icon-button.svelte";

	const { value, label }: { value: string; label: string } = $props();

	let copied = $state(false);

	async function copyCallback() {
		await navigator.clipboard.writeText(value);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function handleCopy() {
		toast.promise(copyCallback(), {
			loading: "Copying",
			success: "Copied.",
			error: "Couldn't copy. Select the text instead.",
		});
	}
</script>

<div class="bg-muted flex min-w-0 items-center gap-2 rounded-xl py-1 pr-1 pl-3">
	<span class="min-w-0 flex-1 truncate font-mono text-xs select-all"
		>{value}</span
	>
	<IconButton
		{label}
		icon={copied ? CheckIcon : CopyIcon}
		onclick={handleCopy}
	/>
</div>
