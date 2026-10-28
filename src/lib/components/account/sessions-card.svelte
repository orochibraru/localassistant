<script lang="ts">
	import { enhance } from "$app/forms";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import MonitorSmartphoneIcon from "@lucide/svelte/icons/monitor-smartphone";

	import ItemMenu from "#lib/components/item-menu.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { deviceName } from "#lib/device-name.js";
	import { enhanceToast } from "#lib/toast.js";

	interface SignedInSession {
		id: string;
		createdAt: Date;
		lastActiveAt: Date;
		userAgent: string | null;
	}

	interface Props {
		sessions: SignedInSession[];
		currentId: string;
	}

	const { sessions, currentId }: Props = $props();

	const others = $derived(sessions.filter((entry) => entry.id !== currentId));
</script>

{#snippet row(entry: SignedInSession)}
	<MonitorSmartphoneIcon class="text-muted-foreground size-4 shrink-0" />
	<div class="min-w-0 flex-1">
		<p class="flex items-center gap-2 truncate text-sm font-medium">
			{deviceName(entry.userAgent ?? "")}
			{#if entry.id === currentId}
				<Badge variant="secondary">This device</Badge>
			{/if}
		</p>
		<p class="text-muted-foreground text-xs">
			Last used {new Date(entry.lastActiveAt).toLocaleString()}, signed in {new Date(
				entry.createdAt,
			).toLocaleDateString()}
		</p>
	</div>
{/snippet}

<section class="glass rounded-2xl p-4 md:p-6">
	<div class="flex items-start gap-3">
		<div
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
		>
			<MonitorSmartphoneIcon class="size-5" />
		</div>
		<div class="min-w-0 flex-1">
			<h2 class="font-semibold">Where you're signed in</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Sign out a device you don't recognise or don't use any more.
			</p>
		</div>
	</div>

	<ul class="divide-border mt-5 divide-y rounded-xl border">
		{#each sessions as entry (entry.id)}
			<li>
				{#if entry.id === currentId}
					<div class="flex min-h-11 items-center gap-3 px-3 py-2">
						{@render row(entry)}
					</div>
				{:else}
					<ItemMenu
						title={deviceName(entry.userAgent ?? "")}
						class="px-3 py-2"
						actions={[
							{
								label: "Sign out",
								icon: LogOutIcon,
								destructive: true,
								form: {
									action: "?/revokeSession",
									fields: { id: entry.id },
									loading: "Signing it out",
									success: "Signed out.",
								},
							},
						]}
					>
						{@render row(entry)}
					</ItemMenu>
				{/if}
			</li>
		{/each}
	</ul>

	{#if others.length > 0}
		<form
			method="POST"
			action="?/revokeOtherSessions"
			use:enhance={enhanceToast({
				loading: "Signing out your other devices",
				success: "Your other devices are signed out.",
			})}
		>
			<Button type="submit" variant="outline" class="mt-5 h-11 rounded-xl px-5">
				<LogOutIcon />Sign out everywhere else
			</Button>
		</form>
	{/if}
</section>
