<script lang="ts">
	import { Switch } from "#lib/components/ui/switch/index.js";

	interface Props {
		name: string;
		label: string;
		description: string;
		checked: boolean;
		disabled?: boolean;
	}

	const {
		name,
		label,
		description,
		checked,
		disabled = false,
	}: Props = $props();

	const id = $derived(`setting-${name}`);
</script>

<div class="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
	<label for={id} class="min-w-0 cursor-pointer">
		<span class="block font-medium">{label}</span>
		<span class="text-muted-foreground mt-0.5 block text-sm">{description}</span
		>
	</label>
	<Switch {id} {name} value="true" {checked} {disabled} class="mt-1 shrink-0" />
</div>
