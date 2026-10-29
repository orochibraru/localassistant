<script lang="ts">
	import type { Component } from "svelte";

	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
	import * as Tooltip from "#lib/components/ui/tooltip/index.js";
	import { cn } from "#lib/utils.js";

	interface Props {
		value: string;
		label: string;
		icon?: Component<{ class?: string }>;
		class?: string;
	}

	const { value, label, icon: Icon, class: className }: Props = $props();

	let available = $state(0);
	let needed = $state(0);
	const fits = $derived(!Icon || needed <= available);
</script>

<Tooltip.Root disabled={fits}>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<ToggleGroup.Item
				{...props}
				{value}
				aria-label={label}
				class={cn("relative min-w-0 overflow-hidden", className)}
			>
				<span
					class="flex min-w-0 flex-1 items-center justify-center gap-2"
					bind:clientWidth={available}
				>
					{#if Icon}<Icon class="shrink-0" />{/if}
					{#if fits}<span class="truncate">{label}</span>{/if}
				</span>
				<span
					class="invisible absolute flex items-center gap-2 whitespace-nowrap"
					aria-hidden="true"
					bind:clientWidth={needed}
				>
					{#if Icon}<Icon class="shrink-0" />{/if}{label}
				</span>
			</ToggleGroup.Item>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
