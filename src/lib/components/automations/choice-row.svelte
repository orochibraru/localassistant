<script lang="ts">
	import type { Component } from "svelte";

	import ToggleChoice from "#lib/components/toggle-choice.svelte";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";

	interface Props {
		label: string;
		options: {
			value: string;
			label: string;
			icon?: Component<{ class?: string }>;
		}[];
		value: string;
		onChange: (next: string) => void;
	}

	const { label, options, value, onChange }: Props = $props();
</script>

<ToggleGroup.Root
	type="single"
	{value}
	spacing={2}
	aria-label={label}
	class="w-full"
	onValueChange={(next) => next && onChange(next)}
>
	{#each options as option (option.value)}
		<ToggleChoice
			value={option.value}
			label={option.label}
			icon={option.icon}
			class="bg-secondary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 rounded-xl px-3"
		/>
	{/each}
</ToggleGroup.Root>
