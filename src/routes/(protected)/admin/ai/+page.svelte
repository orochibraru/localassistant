<script lang="ts">
	import { enhance } from "$app/forms";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { tick } from "svelte";

	import CopyField from "#lib/components/copy-field.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { enhanceToast, saveToast } from "#lib/toast.js";

	const { data } = $props();

	let keyErrors = $state<Record<string, string[]>>({});
	const toggles = $state<Record<string, HTMLFormElement | undefined>>({});
	const hidden = $derived(new Set(data.hidden));
</script>

<div
	class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(20rem,28rem)_1fr] lg:items-start"
>
	<div class="flex min-w-0 flex-col gap-6">
		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h2 class="font-semibold">Assistant</h2>
					<p class="text-muted-foreground mt-1 text-sm">
						The chat in the app, powered by Claude: everyone signed in can ask
						it about the house and have it drive devices and scenes. It needs a
						Claude API key from console.anthropic.com, billed to that account.
					</p>
				</div>
				<Badge variant={data.configured ? "default" : "outline"}
					>{data.configured ? "On" : "Off"}</Badge
				>
			</div>
			<form
				method="POST"
				action="?/saveKey"
				class="flex flex-col gap-4"
				use:enhance={enhanceToast({
					loading: "Checking the key with the Claude API",
					success: "Key saved. The assistant is on.",
					reset: true,
					onFailure: (result) => {
						keyErrors = (result?.errors as Record<string, string[]>) ?? {};
					},
					onSuccess: () => {
						keyErrors = {};
					},
				})}
			>
				<Field.Field>
					<Field.Label for="assistant-key">Claude API key</Field.Label>
					<Input
						id="assistant-key"
						name="apiKey"
						type="password"
						autocomplete="off"
						placeholder="sk-ant-…"
						required
						class="h-11"
					/>
					<Field.Description
						>Stored encrypted, never shown again. Saving another replaces it.</Field.Description
					>
					<Field.Error
						errors={keyErrors.apiKey?.map((message) => ({ message }))}
					/>
				</Field.Field>
				<Button type="submit" class="h-11 self-start rounded-xl px-5"
					><KeyRoundIcon />Save the key</Button
				>
			</form>
			{#if data.configured}
				<form
					method="POST"
					action="?/removeKey"
					use:enhance={enhanceToast({
						loading: "Removing the key",
						success: "Key removed. The assistant is off.",
					})}
				>
					<Button
						type="submit"
						variant="ghost"
						class="text-destructive h-11 rounded-xl px-4"
						><Trash2Icon />Remove the key</Button
					>
				</form>
			{/if}
		</section>
		<section class="glass flex min-w-0 flex-col gap-3 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">AI apps (MCP)</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Claude, ChatGPT or Gemini connect here as a custom connector: each
					person signs in and allows their own app, from Account, AI apps.
				</p>
			</div>
			{#if data.mcpUrl}
				<CopyField value={data.mcpUrl} label="Copy the MCP server address" />
			{:else}
				<p class="text-sm">
					AI apps only connect to a server on HTTPS. Put LocalAssistant behind
					HTTPS, then set its address in Access.
				</p>
			{/if}
		</section>
	</div>

	<section class="flex flex-col gap-3" aria-labelledby="visible-heading">
		<div>
			<h2 id="visible-heading" class="font-semibold">What AI can see</h2>
			<p class="text-muted-foreground text-sm">
				Devices turned off here are hidden from the assistant and from AI apps
				connected under Account, AI apps: they can't read or drive them.
			</p>
		</div>
		<ul
			class="glass divide-border flex flex-col divide-y rounded-2xl px-4 md:px-6"
		>
			{#each data.setup as device (device.id)}
				<li class="flex min-h-14 items-center gap-3">
					<span class="min-w-0 flex-1 truncate text-sm">{device.name}</span>
					<form
						bind:this={toggles[device.id]}
						method="POST"
						action="?/visibility"
						use:enhance={saveToast(device.name)}
					>
						<input type="hidden" name="deviceId" value={device.id} />
						<Switch
							name="visible"
							value="true"
							checked={!hidden.has(device.id)}
							aria-label="AI can see {device.name}"
							onCheckedChange={() =>
								void tick().then(() => toggles[device.id]?.requestSubmit())}
						/>
					</form>
				</li>
			{:else}
				<li class="text-muted-foreground py-4 text-sm">No device yet.</li>
			{/each}
		</ul>
	</section>
</div>
