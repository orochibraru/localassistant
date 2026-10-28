<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import UserPlusIcon from "@lucide/svelte/icons/user-plus";

	import Fab from "#lib/components/fab.svelte";
	import TabSection from "#lib/components/tab-section.svelte";

	import { adminTabs } from "./tabs.js";

	const { children } = $props();
</script>

<TabSection
	title="Admin"
	indexHref={resolve("/(protected)/admin")}
	tabs={adminTabs()}
>
	{@render children()}
</TabSection>

{#if page.route.id !== "/(protected)/admin/invites"}
	<Fab
		label="Invite someone"
		icon={UserPlusIcon}
		onclick={() => goto(resolve("/(protected)/admin/invites"))}
	/>
{/if}
