<script lang="ts">
	import "./layout.css";

	import { onNavigate } from "$app/navigation";
	import { ModeWatcher, setMode } from "mode-watcher";
	import { untrack } from "svelte";

	import { appearanceBootScript, applyAppearance } from "#lib/appearance.js";
	import TopLoadingBar from "#lib/components/app-shell/top-loading-bar.svelte";
	import DocumentTitle from "#lib/components/document-title.svelte";
	import { Toaster } from "#lib/components/ui/sonner/index.js";
	import * as Tooltip from "#lib/components/ui/tooltip/index.js";
	import { providePageTitle } from "#lib/page-title.svelte.js";

	const { children, data } = $props();

	providePageTitle();

	$effect(() => {
		const appearance = data.appearance;
		untrack(() => {
			setMode(appearance.theme);
			applyAppearance(
				document.documentElement,
				appearance,
				matchMedia("(prefers-color-scheme: dark)").matches,
			);
		});
	});

	onNavigate((navigation) => {
		if (
			!document.startViewTransition ||
			navigation.from?.url.pathname === navigation.to?.url.pathname
		) {
			return;
		}
		return new Promise((resolveTransition) => {
			document.startViewTransition(async () => {
				resolveTransition();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	{@html appearanceBootScript(data.appearance)}
</svelte:head>

<ModeWatcher defaultMode={data.appearance.theme} />
<Toaster />
<TopLoadingBar />

<Tooltip.Provider delayDuration={300}>
	{@render children()}
</Tooltip.Provider>
<DocumentTitle />
