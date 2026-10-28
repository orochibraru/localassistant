<script lang="ts">
	import NavCards from "#lib/components/nav-cards.svelte";

	import { adminTabs } from "./tabs.js";
</script>

<NavCards tabs={adminTabs()} />
