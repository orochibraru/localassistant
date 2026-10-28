<script lang="ts">
	import { usePageTitle } from "#lib/page-title.svelte.js";

	const title = usePageTitle();
	const text = $derived(
		!title.current
			? "LocalAssistant"
			: title.current.includes("LocalAssistant")
				? title.current
				: `${title.current} · LocalAssistant`,
	);
</script>

<svelte:head>
	<title>{text}</title>
</svelte:head>
