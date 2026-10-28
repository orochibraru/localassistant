<script lang="ts">
	import AppFooter from "#lib/components/app-footer.svelte";

	const { children, data } = $props();
</script>

<div class="flex min-h-dvh flex-col">
	<div class="flex-1">
		{@render children()}
	</div>
	<AppFooter version={data.version} class="pb-safe-bottom px-4 py-6" />
</div>
