<script lang="ts">
	import NavCards from "#lib/components/nav-cards.svelte";

	import { routineTabs } from "./tabs.js";
</script>

<NavCards tabs={routineTabs()} />
