<script lang="ts">
	import type { Component } from "svelte";

	import { Button, type ButtonProps } from "#lib/components/ui/button/index.js";
	import * as Tooltip from "#lib/components/ui/tooltip/index.js";
	import { cn } from "#lib/utils.js";

	type Props = Omit<ButtonProps, "children"> & {
		label: string;
		icon: Component<{ class?: string }>;
	};

	const {
		label,
		icon: Icon,
		class: className,
		variant = "ghost",
		...rest
	}: Props = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{...rest}
				{variant}
				size="icon"
				aria-label={label}
				class={cn("size-11 rounded-full md:size-9", className)}
			>
				<Icon class="size-5" />
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
