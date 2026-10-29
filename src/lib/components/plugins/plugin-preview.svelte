<script lang="ts">
	import { enhance } from "$app/forms";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import StarIcon from "@lucide/svelte/icons/star";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import { pluginIconComponents } from "#lib/components/devices/device-kinds.js";
	import HealthBadge from "#lib/components/plugins/health-badge.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import {
		pluginHealthDescriptions,
		type PluginPreview,
	} from "#lib/plugins.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Props {
		preview: PluginPreview | null;
		onClose: () => void;
	}

	const { preview, onClose }: Props = $props();

	const sheet = {
		get open() {
			return preview !== null;
		},
		set open(value: boolean) {
			if (!value) {
				onClose();
			}
		},
	};
	const blocker = $derived.by(() => {
		if (!preview) {
			return null;
		}
		if (preview.conflict) {
			return preview.conflict;
		}
		return preview.compatible
			? null
			: `It needs LocalAssistant ${preview.manifest.localassistant} or newer. Update LocalAssistant first.`;
	});
</script>

<ResponsiveSheet
	bind:open={sheet.open}
	title={preview?.manifest.name ?? ""}
	description={preview?.manifest.description ?? ""}
>
	{#if preview}
		{@const Icon = pluginIconComponents[preview.manifest.icon]}
		<div class="flex flex-col gap-4 pb-6">
			<div class="flex items-center gap-3">
				<span
					class="bg-accent text-accent-foreground flex size-12 shrink-0 items-center justify-center rounded-xl"
					aria-hidden="true"
				>
					<Icon class="size-6" />
				</span>
				<div class="min-w-0 flex-1 text-sm">
					<p class="font-medium">
						{preview.manifest.author ?? preview.repository.split("/")[0]},
						version
						{preview.status.latestVersion ?? preview.manifest.version}
					</p>
					{#if preview.url}
						<a
							href={preview.url}
							target="_blank"
							rel="noreferrer"
							class="text-primary inline-flex min-h-11 items-center truncate"
							>{preview.site}/{preview.repository}{preview.path
								? `/${preview.path}`
								: ""}</a
						>
					{:else}
						<p class="text-muted-foreground min-h-11 truncate leading-11">
							{preview.repository}, on {preview.site}
						</p>
					{/if}
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<HealthBadge health={preview.status.health} />
				{#if preview.status.stars !== null}
					<span
						class="text-muted-foreground inline-flex items-center gap-1 text-sm"
						><StarIcon class="size-4" />{preview.status.stars}</span
					>
				{/if}
			</div>
			<p class="text-muted-foreground text-sm">
				{pluginHealthDescriptions[preview.status.health]}
			</p>
			<div>
				<p class="text-sm font-medium">It adds</p>
				<p class="text-muted-foreground text-sm">
					{preview.manifest.kinds.map((kind) => kind.label).join(", ")}
				</p>
			</div>
			<div class="bg-muted/60 flex gap-3 rounded-xl p-3 text-sm">
				<TriangleAlertIcon class="text-destructive mt-0.5 size-4 shrink-0" />
				<p>
					An integration runs on this server with full access to your devices
					and your network. Only add one from someone you trust.
				</p>
			</div>
			{#if blocker}
				<p class="text-destructive text-sm">{blocker}</p>
			{:else}
				<form
					method="POST"
					action="?/install"
					use:enhance={enhanceToast({
						loading: `Installing ${preview.manifest.name}`,
						success: `${preview.manifest.name} is ready. Set it up from Devices.`,
						onSuccess: onClose,
					})}
				>
					<input type="hidden" name="link" value={preview.link} />
					<Button type="submit" class="h-11 w-full rounded-xl px-5"
						><DownloadIcon />{preview.installed
							? "Reinstall the latest version"
							: "Install"}</Button
					>
				</form>
			{/if}
		</div>
	{/if}
</ResponsiveSheet>
