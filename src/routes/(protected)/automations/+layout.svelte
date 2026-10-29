<script lang="ts">
	import { resolve } from "$app/paths";

	import TabSection from "#lib/components/tab-section.svelte";

	import { routineTabs } from "./tabs.js";

	const { children } = $props();
</script>

<TabSection
	title="Routines"
	indexHref={resolve("/(protected)/automations")}
	tabs={routineTabs()}
>
	{@render children()}
</TabSection>
