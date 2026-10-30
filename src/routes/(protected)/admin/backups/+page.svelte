<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import DatabaseBackupIcon from "@lucide/svelte/icons/database-backup";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import EmptyState from "#lib/components/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { formatBytes } from "#lib/format.js";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(20rem,28rem)_1fr] lg:items-start">
	<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
		<div>
			<h2 class="font-semibold">Backups</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				The worker copies the whole database every day into a backups folder
				next to it and keeps the last seven. Download one to keep it somewhere
				else: it holds every account, device and setting, its secrets encrypted
				with this server's AUTH_SECRET, so restoring needs the same one.
			</p>
		</div>
		<form
			method="POST"
			action="?/create"
			use:enhance={enhanceToast({
				loading: "Backing up",
				success: "Backed up.",
			})}
		>
			<Button type="submit" class="h-11 rounded-xl px-5"
				><DatabaseBackupIcon />Back up now</Button
			>
		</form>
		<p class="text-muted-foreground text-sm">
			To restore: stop LocalAssistant, put the backup in place of the database
			file (DATABASE_PATH), delete the -wal and -shm files next to it, and start
			it again.
		</p>
	</section>

	<section class="flex flex-col gap-3" aria-labelledby="backups-heading">
		<h2 id="backups-heading" class="font-semibold">On this server</h2>
		{#if data.backups.length === 0}
			<div class="glass rounded-2xl">
				<EmptyState
					icon={DatabaseBackupIcon}
					title="No backup yet"
					subtitle="The first one is taken when the worker starts, then every day."
				/>
			</div>
		{:else}
			<ul
				class="glass divide-border flex flex-col divide-y rounded-2xl px-4 md:px-6"
			>
				{#each data.backups as backup (backup.name)}
					<li class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2">
						<span class="min-w-0 flex-1">
							<span class="block text-sm font-medium"
								>{backup.createdAt.toLocaleString()}</span
							>
							<span class="text-muted-foreground block text-xs"
								>{formatBytes(backup.size)}</span
							>
						</span>
						<Button
							variant="ghost"
							class="h-11 rounded-xl px-4"
							href={resolve("/(protected)/admin/backups/[name]", {
								name: backup.name,
							})}
							download={backup.name}
							data-sveltekit-reload><DownloadIcon />Download</Button
						>
						<form
							method="POST"
							action="?/remove"
							use:enhance={enhanceToast({
								loading: "Deleting",
								success: "Backup deleted.",
							})}
						>
							<input type="hidden" name="name" value={backup.name} />
							<Button
								type="submit"
								variant="ghost"
								class="text-destructive h-11 rounded-xl px-4"
								><Trash2Icon />Delete</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
