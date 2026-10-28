<script lang="ts">
	import AppFooter from "#lib/components/app-footer.svelte";
	import AppBar from "#lib/components/app-shell/app-bar.svelte";
	import BottomTabBar from "#lib/components/app-shell/bottom-tab-bar.svelte";
	import PageHeader from "#lib/components/app-shell/page-header.svelte";
	import Sidebar from "#lib/components/app-shell/sidebar.svelte";
	import InstallPrompt from "#lib/components/install-prompt.svelte";

	const { children, data } = $props();
</script>

<div class="flex min-h-dvh flex-col md:pl-64">
	<main
		class="min-h-dvh flex-1 pt-[calc(env(safe-area-inset-top)+4.25rem)] pb-10 md:pt-8"
	>
		<div class="px-[max(1rem,env(safe-area-inset-left))] md:px-8 xl:px-10">
			<PageHeader />
			{@render children()}
		</div>
	</main>
	<AppFooter version={data.version} class="px-4 pb-32 md:pb-8" />
</div>
<AppBar />
<Sidebar isAdmin={data.isAdmin} user={data.user} />
<BottomTabBar isAdmin={data.isAdmin} />
<InstallPrompt />
