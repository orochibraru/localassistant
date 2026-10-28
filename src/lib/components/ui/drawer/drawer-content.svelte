<script lang="ts">
	import type { ComponentProps } from "svelte";
	import { Drawer as DrawerPrimitive } from "vaul-svelte";

	import { cn } from "#lib/utils.js";
	import type { WithoutChildrenOrChild } from "#lib/utils.js";

	import DrawerOverlay from "./drawer-overlay.svelte";
	import DrawerPortal from "./drawer-portal.svelte";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		...restProps
	}: DrawerPrimitive.ContentProps & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DrawerPortal>>;
	} = $props();
</script>

<DrawerPortal {...portalProps}>
	<DrawerOverlay />
	<DrawerPrimitive.Content
		bind:ref
		data-slot="drawer-content"
		class={cn(
			"bg-popover text-popover-foreground border-border border shadow-[0_-12px_48px_-16px_var(--glass-shadow)] group/drawer-content after:hidden! fixed z-50 flex h-auto flex-col text-sm data-[vaul-drawer-direction=bottom]:right-[max(0.5rem,env(safe-area-inset-right))] data-[vaul-drawer-direction=bottom]:bottom-2 data-[vaul-drawer-direction=bottom]:left-[max(0.5rem,env(safe-area-inset-left))] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] data-[vaul-drawer-direction=bottom]:rounded-[2.25rem] data-[vaul-drawer-direction=bottom]:pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.5rem))] data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:inset-s-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:rounded-r-xl data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:inset-e-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:rounded-l-xl data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-xl data-[vaul-drawer-direction=top]:border-b",
			className,
		)}
		{...restProps}
	>
		<div
			class="hidden shrink-0 cursor-grab justify-center pt-3 pb-2 group-data-[vaul-drawer-direction=bottom]/drawer-content:flex"
			aria-hidden="true"
		>
			<div class="bg-muted-foreground/30 h-1.5 w-12 rounded-full"></div>
		</div>
		{@render children?.()}
	</DrawerPrimitive.Content>
</DrawerPortal>
