<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";

	import IconButton from "#lib/components/icon-button.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import type { HeaderAction } from "#lib/page-title.svelte.js";
	import { usePageTitle } from "#lib/page-title.svelte.js";

	const title = usePageTitle();
	const mobileActions = $derived(
		title.actions.filter((action) => !action.primary),
	);

	let scrolled = $state(false);
	let moreOpen = $state(false);

	function choose(action: HeaderAction) {
		moreOpen = false;
		action.onSelect?.();
	}
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 8)} />

<svelte:head>
	<title
		>{title.current && title.current !== "LocalAssistant"
			? `${title.current} | LocalAssistant`
			: "LocalAssistant"}</title
	>
</svelte:head>

<header
	class="bg-chrome pt-safe-top fixed inset-x-0 top-0 z-40 border-b backdrop-blur-2xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-300 md:hidden {scrolled
		? 'border-border shadow-[0_8px_24px_-16px_var(--glass-shadow)]'
		: 'border-transparent'}"
	style="view-transition-name: app-bar"
>
	<div class="relative flex h-14 items-center justify-center px-14">
		{#if title.backHref}
			<div class="absolute top-1/2 left-1.5 -translate-y-1/2">
				<IconButton label="Back" icon={ChevronLeftIcon} href={title.backHref} />
			</div>
		{:else if page.data.user}
			<a
				href={resolve("/(protected)/account")}
				aria-label="Your account, {page.data.user.name}"
				class="absolute top-1/2 left-1.5 flex size-11 -translate-y-1/2 items-center justify-center"
			>
				<span
					class="from-primary flex size-8 items-center justify-center rounded-full bg-linear-to-br to-[oklch(0.6_0.15_calc(var(--hue)+60))] text-sm font-semibold text-white"
					>{page.data.user.name.slice(0, 1).toUpperCase()}</span
				>
			</a>
		{/if}
		<h1 class="truncate text-[1.0625rem] font-semibold">{title.current}</h1>
		{#if mobileActions.length === 1}
			{@const [action] = mobileActions}
			<div class="absolute top-1/2 right-1.5 -translate-y-1/2">
				<IconButton
					label={action?.label ?? ""}
					icon={action?.icon ?? EllipsisIcon}
					href={action?.href}
					onclick={action?.onSelect}
				/>
			</div>
		{:else if mobileActions.length > 1}
			<div class="absolute top-1/2 right-1.5 -translate-y-1/2">
				<IconButton
					label="More options"
					icon={EllipsisIcon}
					onclick={() => (moreOpen = true)}
				/>
			</div>
		{/if}
	</div>
</header>

<ResponsiveSheet bind:open={moreOpen} title={title.current}>
	<ul class="flex flex-col gap-1 pb-4">
		{#each mobileActions as action (action.label)}
			<li>
				{#if action.href}
					<a
						href={action.href}
						onclick={() => (moreOpen = false)}
						class="hover:bg-muted flex min-h-12 items-center gap-3 rounded-xl px-2 font-medium"
					>
						<span
							class="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-lg"
						>
							<action.icon class="size-4" />
						</span>
						{action.label}
					</a>
				{:else}
					<button
						type="button"
						onclick={() => choose(action)}
						class="hover:bg-muted flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left font-medium"
					>
						<span
							class="bg-accent text-accent-foreground flex size-9 items-center justify-center rounded-lg"
						>
							<action.icon class="size-4" />
						</span>
						{action.label}
					</button>
				{/if}
			</li>
		{/each}
	</ul>
</ResponsiveSheet>
