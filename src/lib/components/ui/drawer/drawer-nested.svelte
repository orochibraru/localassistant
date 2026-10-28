<script lang="ts">
	import { Drawer as DrawerPrimitive } from "vaul-svelte";

	import { markInsideDrawer } from "./inside.js";

	let {
		shouldScaleBackground = true,
		open = $bindable(false),
		activeSnapPoint = $bindable(null),
		...restProps
	}: DrawerPrimitive.RootProps = $props();

	markInsideDrawer();
</script>

<DrawerPrimitive.NestedRoot
	{shouldScaleBackground}
	bind:open
	bind:activeSnapPoint
	{...restProps}
/>
