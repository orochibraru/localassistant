<script lang="ts">
	import { enhance } from "$app/forms";
	import CheckIcon from "@lucide/svelte/icons/check";
	import SendIcon from "@lucide/svelte/icons/send";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import Picker from "#lib/components/picker.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast, saveToast } from "#lib/toast.js";

	const { data } = $props();

	let errors = $state<Record<string, string[]>>({});

	const fieldErrors = (name: string) =>
		errors[name]?.map((message) => ({ message }));
</script>

<div
	class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] lg:items-start"
>
	<form
		method="POST"
		action="?/save"
		class="glass flex flex-col gap-5 rounded-2xl p-4 md:p-6"
		use:enhance={enhanceToast({
			loading: "Saving email settings",
			success: "Email settings saved.",
			onFailure: (result) =>
				(errors = (result?.errors as Record<string, string[]>) ?? {}),
			onSuccess: () => {
				errors = {};
			},
		})}
	>
		<div>
			<h2 class="font-semibold">SMTP server</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Used for invites and sign-in emails. Emails leave from the background
				worker, with retries.
			</p>
		</div>
		<div class="grid gap-5 md:grid-cols-[1fr_8rem]">
			<Field.Field>
				<Field.Label for="smtp-host">Host</Field.Label>
				<Input
					id="smtp-host"
					name="host"
					value={data.smtp?.host ?? ""}
					placeholder="smtp.example.com"
					required
					class="h-11"
				/>
				<Field.Error errors={fieldErrors("host")} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="smtp-port">Port</Field.Label>
				<Input
					id="smtp-port"
					name="port"
					type="number"
					inputmode="numeric"
					value={data.smtp?.port ?? 587}
					required
					class="h-11"
				/>
				<Field.Error errors={fieldErrors("port")} />
			</Field.Field>
		</div>
		<Field.Field>
			<Field.Label for="smtp-security">Encryption</Field.Label>
			<Picker
				id="smtp-security"
				name="security"
				label="Encryption"
				options={[
					{ value: "starttls", label: "STARTTLS (port 587)" },
					{ value: "tls", label: "TLS (port 465)" },
					{ value: "none", label: "None" },
				]}
				value={data.smtp?.security ?? "starttls"}
			/>
		</Field.Field>
		<div class="grid gap-5 md:grid-cols-2">
			<Field.Field>
				<Field.Label for="smtp-username">Username</Field.Label>
				<Input
					id="smtp-username"
					name="username"
					value={data.smtp?.username ?? ""}
					autocomplete="off"
					class="h-11"
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label for="smtp-password">Password</Field.Label>
				<Input
					id="smtp-password"
					name="password"
					type="password"
					autocomplete="off"
					placeholder={data.smtp?.hasPassword ? "Unchanged" : ""}
					class="h-11"
				/>
				<Field.Description
					>Stored encrypted. Leave empty to keep the current one.</Field.Description
				>
			</Field.Field>
		</div>
		<div class="grid gap-5 md:grid-cols-2">
			<Field.Field>
				<Field.Label for="smtp-from-address">From address</Field.Label>
				<Input
					id="smtp-from-address"
					name="fromAddress"
					type="email"
					value={data.smtp?.fromAddress ?? ""}
					placeholder="localassistant@example.com"
					required
					class="h-11"
				/>
				<Field.Error errors={fieldErrors("fromAddress")} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="smtp-from-name">From name</Field.Label>
				<Input
					id="smtp-from-name"
					name="fromName"
					value={data.smtp?.fromName ?? "LocalAssistant"}
					required
					class="h-11"
				/>
				<Field.Error errors={fieldErrors("fromName")} />
			</Field.Field>
		</div>
		<Button type="submit" class="h-11 self-start rounded-xl px-5"
			><CheckIcon />Save</Button
		>
	</form>

	{#if data.smtp}
		<div class="flex flex-col gap-3 md:flex-row">
			<form
				method="POST"
				action="?/test"
				use:enhance={enhanceToast({
					loading: "Queuing a test email",
					success: "Test email queued. Check your inbox.",
				})}
			>
				<Button
					type="submit"
					variant="outline"
					class="h-11 w-full rounded-xl px-5"
					><SendIcon />Send me a test email</Button
				>
			</form>
			<form
				method="POST"
				action="?/remove"
				use:enhance={saveToast("Email settings")}
			>
				<Button
					type="submit"
					variant="destructive"
					class="h-11 w-full rounded-xl px-5"
					><Trash2Icon />Remove email settings</Button
				>
			</form>
		</div>
	{/if}
</div>
