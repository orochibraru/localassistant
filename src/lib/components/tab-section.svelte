<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import type { Snippet } from "svelte";
	import { MediaQuery } from "svelte/reactivity";

	import type { SectionTab } from "#lib/components/nav-cards.svelte";
	import TabNav from "#lib/components/tab-nav.svelte";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	interface Props {
		title: string;
		indexHref: string;
		backHref?: string;
		tabs: SectionTab[];
		children: Snippet;
	}

	const { title, indexHref, backHref, tabs, children }: Props = $props();

	const onIndex = $derived(page.url.pathname === indexHref);
	const active = $derived(
		tabs.find(
			(tab) =>
				page.url.pathname === tab.href ||
				page.url.pathname.startsWith(`${tab.href}/`),
		),
	);

	const desktop = new MediaQuery("(min-width: 768px)");

	$effect(() => {
		const first = tabs[0];
		if (desktop.current && onIndex && first) {
			goto(first.href, { replace: true });
		}
	});

	setPageTitle(
		() => (desktop.current || onIndex || !active ? title : active.label),
		() => (desktop.current || onIndex ? backHref : indexHref),
	);
</script>

<div class="mb-6 hidden md:block">
	<TabNav {tabs} />
</div>
{@render children()}
