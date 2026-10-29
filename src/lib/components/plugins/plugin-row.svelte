<script lang="ts">
	import { enhance } from "$app/forms";
	import ArrowUpCircleIcon from "@lucide/svelte/icons/circle-arrow-up";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PowerIcon from "@lucide/svelte/icons/power";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import { pluginIconComponents } from "#lib/components/devices/device-kinds.js";
	import HealthBadge from "#lib/components/plugins/health-badge.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import type { PluginSummary } from "#lib/plugins.js";
	import { useSheets } from "#lib/sheets.svelte.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Props {
		plugin: PluginSummary;
	}

	const { plugin }: Props = $props();

	const sheets = useSheets();
	let confirmingRemove = $state(false);

	const Icon = $derived(pluginIconComponents[plugin.icon]);
</script>

<article class="glass flex flex-col gap-3 rounded-2xl p-4">
	<header class="flex items-start gap-3">
		<span
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			aria-hidden="true"
		>
			<Icon class="size-5" />
		</span>
		<div class="min-w-0 flex-1">
			<h3 class="truncate font-semibold">{plugin.name}</h3>
			<p class="text-muted-foreground text-sm">
				{plugin.official ? "LocalAssistant" : (plugin.author ?? "Community")},
				version
				{plugin.version}, {plugin.devices}
				{plugin.devices === 1 ? "device" : "devices"}
			</p>
		</div>
	</header>
	<div class="flex flex-wrap gap-2">
		<HealthBadge health={plugin.status.health} />
		{#if !plugin.enabled}<Badge variant="outline">Off</Badge>{/if}
		{#if plugin.updateAvailable}<Badge>Update available</Badge>{/if}
		{#if !plugin.compatible}<Badge variant="destructive"
				>Needs a newer LocalAssistant</Badge
			>{/if}
		{#if plugin.loadError}<Badge variant="destructive">Didn't load</Badge>{/if}
	</div>
	<p class="text-muted-foreground text-sm">{plugin.description}</p>
	{#if plugin.loadError}
		<p class="text-destructive text-sm">{plugin.loadError}</p>
	{/if}
	<div class="flex flex-wrap gap-2">
		{#if plugin.enabled && !plugin.loadError}
			<Button
				variant="outline"
				class="h-11 rounded-xl px-4"
				onclick={() => (sheets.addDevice = plugin.id)}
				><SettingsIcon />Set up</Button
			>
		{/if}
		{#if plugin.updateAvailable}
			<form
				method="POST"
				action="?/update"
				use:enhance={enhanceToast({
					loading: `Updating ${plugin.name}`,
					success: `${plugin.name} is up to date.`,
				})}
			>
				<input type="hidden" name="plugin" value={plugin.id} />
				<Button type="submit" class="h-11 rounded-xl px-4"
					><ArrowUpCircleIcon />Update to {plugin.status.latestVersion}</Button
				>
			</form>
		{/if}
		<form
			method="POST"
			action="?/enable"
			use:enhance={enhanceToast({
				loading: plugin.enabled ? "Turning it off" : "Turning it on",
				success: plugin.enabled
					? `${plugin.name} is off. Its devices stay, unread.`
					: `${plugin.name} is on.`,
			})}
		>
			<input type="hidden" name="plugin" value={plugin.id} />
			<input type="hidden" name="enabled" value={String(!plugin.enabled)} />
			<Button type="submit" variant="secondary" class="h-11 rounded-xl px-4"
				><PowerIcon />{plugin.enabled ? "Turn off" : "Turn on"}</Button
			>
		</form>
		<Button
			href={plugin.url}
			target="_blank"
			rel="noreferrer"
			variant="ghost"
			class="h-11 rounded-xl px-4"><ExternalLinkIcon />On GitHub</Button
		>
		{#if !plugin.official && !confirmingRemove}
			<Button
				variant="ghost"
				class="text-destructive h-11 rounded-xl px-4"
				onclick={() => (confirmingRemove = true)}><Trash2Icon />Remove</Button
			>
		{/if}
	</div>
	{#if confirmingRemove}
		<form
			method="POST"
			action="?/remove"
			class="border-border flex flex-col gap-3 border-t pt-3"
			use:enhance={enhanceToast({
				loading: `Removing ${plugin.name}`,
				success: `${plugin.name} removed.`,
			})}
		>
			<input type="hidden" name="plugin" value={plugin.id} />
			<p class="text-sm">
				Its {plugin.devices}
				{plugin.devices === 1 ? "device goes" : "devices go"} with it, and so does
				its connection.
			</p>
			<div class="flex gap-3">
				<Button
					type="submit"
					variant="destructive"
					class="h-11 flex-1 rounded-xl"
					><Trash2Icon />Remove {plugin.name}</Button
				>
				<Button
					variant="secondary"
					class="h-11 rounded-xl px-5"
					onclick={() => (confirmingRemove = false)}>Keep it</Button
				>
			</div>
		</form>
	{/if}
</article>
