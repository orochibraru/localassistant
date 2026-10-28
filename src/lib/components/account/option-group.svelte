<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import type { Component, Snippet } from "svelte";

	interface Option {
		value: string;
		label: string;
		description?: string;
		icon?: Component<{ class?: string }>;
	}

	interface Props {
		name: string;
		legend: string;
		options: readonly Option[];
		value: string;
		onchange: () => void;
		swatch?: Snippet<[Option]>;
	}

	let {
		name,
		legend,
		options,
		value = $bindable(),
		onchange,
		swatch,
	}: Props = $props();
</script>

<fieldset>
	<legend class="mb-2 px-1 text-sm font-medium">{legend}</legend>
	<div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
		{#each options as option (option.value)}
			<label
				class="group border-border bg-card has-checked:border-primary has-checked:ring-primary/30 has-focus-visible:ring-ring/50 flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-all has-checked:ring-2 has-focus-visible:ring-3"
			>
				<input
					type="radio"
					{name}
					value={option.value}
					bind:group={value}
					{onchange}
					class="sr-only"
				/>
				<span
					class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
					aria-hidden="true"
				>
					{#if swatch}
						{@render swatch(option)}
					{:else if option.icon}
						<option.icon class="size-5" />
					{/if}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-sm font-medium">{option.label}</span>
					{#if option.description}
						<span class="text-muted-foreground block text-sm"
							>{option.description}</span
						>
					{/if}
				</span>
				<CheckIcon
					class="text-primary hidden size-5 shrink-0 group-has-checked:block"
					aria-hidden="true"
				/>
			</label>
		{/each}
	</div>
</fieldset>
