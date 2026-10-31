<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import BellIcon from "@lucide/svelte/icons/bell";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import XIcon from "@lucide/svelte/icons/x";
	import { toast } from "svelte-sonner";

	import EmptyState from "#lib/components/empty-state.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { readAgo } from "#lib/devices.js";
	import { sceneActionPrefix } from "#lib/notifications.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { activateScene } from "#lib/remote/scenes.remote.js";
	import { enhanceToast, toastError } from "#lib/toast.js";

	const { data } = $props();

	let clearForm = $state<HTMLFormElement>();

	setPageTitle("Notifications", undefined, () => [
		{
			label: "Notification settings",
			icon: SettingsIcon,
			href: resolve("/(protected)/account/notifications"),
		},
		...(data.notifications.length > 0
			? [
					{
						label: "Clear all",
						icon: Trash2Icon,
						onSelect: () => clearForm?.requestSubmit(),
					},
				]
			: []),
	]);

	const days = $derived.by(() => {
		const groups: { day: string; entries: typeof data.notifications }[] = [];
		for (const entry of data.notifications) {
			const day = entry.createdAt.toLocaleDateString(undefined, {
				weekday: "long",
				day: "numeric",
				month: "long",
			});
			const group = groups.at(-1);
			if (group?.day === day) {
				group.entries.push(entry);
			} else {
				groups.push({ day, entries: [entry] });
			}
		}
		return groups;
	});

	async function setSceneCallback(action: string) {
		await activateScene({ sceneId: action.slice(sceneActionPrefix.length) });
	}

	function handleSetScene(action: string, title: string) {
		toast.promise(setSceneCallback(action), {
			loading: `Setting ${title}`,
			success: `${title} set.`,
			error: (failure: unknown) => toastError(failure),
		});
	}
</script>

<form
	bind:this={clearForm}
	method="POST"
	action="?/clear"
	class="hidden"
	use:enhance={enhanceToast({
		loading: "Clearing the notifications",
		success: "Notifications cleared.",
	})}
></form>

{#if data.notifications.length === 0}
	<div class="glass rounded-2xl">
		<EmptyState
			icon={BellIcon}
			title="No notifications"
			subtitle="What devices, routines and integrations tell you shows here for 30 days, even on a device without push."
		>
			<Button
				variant="outline"
				class="h-11 rounded-xl"
				href={resolve("/(protected)/account/notifications")}
				><SettingsIcon />Notification settings</Button
			>
		</EmptyState>
	</div>
{:else}
	<div class="flex flex-col gap-6">
		{#each days as group (group.day)}
			<section aria-label={group.day}>
				<h2 class="text-muted-foreground mb-2 text-sm font-medium">
					{group.day}
				</h2>
				<ul class="glass divide-border flex flex-col divide-y rounded-2xl">
					{#each group.entries as entry (entry.id)}
						<li class="flex items-start gap-1 py-1 pr-1 pl-4 md:pl-6">
							<a
								href={entry.url}
								class="flex min-h-11 min-w-0 flex-1 items-start gap-3 py-2"
							>
								<span
									class="mt-1.5 size-2 shrink-0 rounded-full {entry.readAt
										? 'bg-transparent'
										: 'bg-primary'}"
									aria-label={entry.readAt ? undefined : "Unread"}
								></span>
								<span class="min-w-0 flex-1">
									<span
										class="block {entry.readAt
											? 'font-medium'
											: 'font-semibold'}">{entry.title}</span
									>
									{#if entry.body}
										<span class="text-muted-foreground block text-sm"
											>{entry.body}</span
										>
									{/if}
									<span class="text-muted-foreground mt-1 block text-xs"
										>{readAgo(entry.createdAt)}</span
									>
								</span>
							</a>
							{#if entry.actions.length > 0}
								<div class="flex flex-wrap gap-2 self-center py-2">
									{#each entry.actions as action (action.action)}
										{#if action.action.startsWith(sceneActionPrefix)}
											<Button
												variant="secondary"
												class="h-11 rounded-xl"
												onclick={() =>
													handleSetScene(action.action, action.title)}
												>{action.title}</Button
											>
										{/if}
									{/each}
								</div>
							{/if}
							<form
								method="POST"
								action="?/remove"
								class="self-center"
								use:enhance={enhanceToast({
									loading: "Removing",
									success: "Removed.",
								})}
							>
								<input type="hidden" name="id" value={entry.id} />
								<IconButton
									type="submit"
									label="Remove {entry.title}"
									icon={XIcon}
								/>
							</form>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}
