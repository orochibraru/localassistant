<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import HouseIcon from "@lucide/svelte/icons/house";
	import { toast } from "svelte-sonner";

	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { chooseHome } from "#lib/remote/homes.remote.js";
	import { toastError } from "#lib/toast.js";
	import { cn } from "#lib/utils.js";

	interface Props {
		home: { id: string; name: string };
		homes: { id: string; name: string }[];
		class?: string;
	}

	const { home, homes, class: className }: Props = $props();

	async function chooseCallback(homeId: string) {
		await chooseHome(homeId);
		await invalidateAll();
	}

	function handleChoose(next: { id: string; name: string }) {
		if (next.id === home.id) {
			return;
		}
		toast.promise(chooseCallback(next.id), {
			loading: `Opening ${next.name}`,
			success: `Now in ${next.name}.`,
			error: (failure) => toastError(failure),
		});
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={cn(
			"hover:bg-muted aria-expanded:bg-muted flex h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm font-medium transition-colors",
			className,
		)}
		aria-label="Home: {home.name}"
	>
		<HouseIcon class="text-muted-foreground size-4 shrink-0" />
		<span class="min-w-0 flex-1 truncate">{home.name}</span>
		<ChevronsUpDownIcon class="text-muted-foreground size-4 shrink-0" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content
		align="start"
		class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
	>
		{#each homes as entry (entry.id)}
			<DropdownMenu.Item onSelect={() => handleChoose(entry)}>
				<HouseIcon />
				<span class="flex-1 truncate">{entry.name}</span>
				{#if entry.id === home.id}<CheckIcon />{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
