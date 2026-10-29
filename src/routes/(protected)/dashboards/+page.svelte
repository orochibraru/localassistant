<script lang="ts">
	import { resolve } from "$app/paths";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import DashboardSheet from "#lib/components/dashboards/dashboard-sheet.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import Fab from "#lib/components/fab.svelte";
	import ItemMenu from "#lib/components/item-menu.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	let sheetOpen = $state(false);

	setPageTitle("Dashboards", undefined, () => [
		{
			label: "New dashboard",
			icon: PlusIcon,
			onSelect: () => (sheetOpen = true),
			primary: true,
		},
	]);
</script>

{#if data.dashboards.length === 0}
	<div class="glass rounded-2xl">
		<EmptyState
			icon={LayoutDashboardIcon}
			title="No dashboard yet"
			subtitle="Put the devices, scenes and graphs you use together on one page of your own: bedtime, the kitchen, the garden."
		>
			<Button class="h-11 rounded-xl px-5" onclick={() => (sheetOpen = true)}
				><PlusIcon />New dashboard</Button
			>
		</EmptyState>
	</div>
{:else}
	<ul class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]">
		{#each data.dashboards as dashboard (dashboard.id)}
			<li class="glass flex min-h-14 items-center gap-1 rounded-2xl pr-2">
				<a
					href={resolve("/(protected)/dashboards/[dashboardId]", {
						dashboardId: dashboard.id,
					})}
					class="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4"
				>
					<LayoutDashboardIcon class="text-muted-foreground size-5 shrink-0" />
					<span class="min-w-0 flex-1 truncate font-medium"
						>{dashboard.name}</span
					>
					<ChevronRightIcon class="text-muted-foreground size-4" />
				</a>
				<ItemMenu
					title={dashboard.name}
					actions={[
						{
							label: "Delete",
							icon: Trash2Icon,
							destructive: true,
							form: {
								action: "?/remove",
								fields: { id: dashboard.id },
								loading: "Deleting",
								success: `${dashboard.name} deleted.`,
								confirm: {
									title: `Delete ${dashboard.name}?`,
									description: "Its devices stay where they are.",
									confirmLabel: "Delete",
								},
							},
						},
					]}
				>
					<span class="sr-only">{dashboard.name}</span>
				</ItemMenu>
			</li>
		{/each}
	</ul>
{/if}

<Fab label="New dashboard" icon={PlusIcon} onclick={() => (sheetOpen = true)} />

<DashboardSheet
	bind:open={sheetOpen}
	editing={null}
	devices={data.setup}
	scenes={data.scenes}
/>
