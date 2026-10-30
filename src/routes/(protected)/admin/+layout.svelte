<script lang="ts">
	import { resolve } from "$app/paths";

	import TabSection from "#lib/components/tab-section.svelte";

	import { adminTabs } from "./tabs.js";

	const { children } = $props();
</script>

<TabSection
	title="Admin"
	indexHref={resolve("/(protected)/admin")}
	tabs={adminTabs()}
>
	{@render children()}
</TabSection>
