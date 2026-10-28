<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import UploadIcon from "@lucide/svelte/icons/upload";

	import { Button } from "#lib/components/ui/button/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();

	let withSecrets = $state(false);

	const exportHref = $derived(
		`${resolve("/(protected)/admin/configuration/export")}${withSecrets ? "?secrets=true" : ""}`,
	);

	function plural(count: unknown, word: string): string {
		return `${String(count)} ${word}${count === 1 ? "" : "s"}`;
	}
</script>

<div class="grid gap-6 lg:grid-cols-2 lg:items-start">
	<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
		<div>
			<h2 class="font-semibold">Export</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{data.home.name}'s floors, rooms and devices, and the MELCloud account,
				as a JSON file to keep or to load into another LocalAssistant.
			</p>
		</div>
		<Field.Field orientation="horizontal">
			<Checkbox id="with-secrets" bind:checked={withSecrets} />
			<Field.Label for="with-secrets"
				>Include device keys, access codes and the MELCloud password</Field.Label
			>
		</Field.Field>
		{#if withSecrets}
			<p class="text-destructive text-sm">
				They're written in plain text: keep the file somewhere safe.
			</p>
		{/if}
		<Button
			href={exportHref}
			download
			data-sveltekit-reload
			class="h-11 self-start rounded-xl px-5"><DownloadIcon />Download</Button
		>
	</section>

	<form
		method="POST"
		action="?/import"
		enctype="multipart/form-data"
		class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6"
		use:enhance={enhanceToast({
			loading: "Importing",
			success: (result) =>
				`Imported ${plural(result?.floors, "floor")}, ${plural(result?.rooms, "room")} and ${plural(result?.devices, "device")}.`,
			reset: true,
		})}
	>
		<div>
			<h2 class="font-semibold">Import</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Merges a file into {data.home.name}: floors match by name, rooms by name
				and floor, devices by their id. Nothing is deleted, and keys only change
				when the file has them.
			</p>
		</div>
		<Field.Field>
			<Field.Label for="config-file">Configuration file</Field.Label>
			<Input
				id="config-file"
				name="file"
				type="file"
				accept="application/json,.json"
				required
				class="h-11"
			/>
		</Field.Field>
		<Button type="submit" class="h-11 self-start rounded-xl px-5"
			><UploadIcon />Import</Button
		>
	</form>
</div>
