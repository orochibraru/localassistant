<script lang="ts">
	import { resolve } from "$app/paths";
	import MailCheckIcon from "@lucide/svelte/icons/mail-check";
	import SendIcon from "@lucide/svelte/icons/send";

	import AuthShell from "#lib/components/auth-shell.svelte";
	import AuthForm from "#lib/components/auth/auth-form.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";

	const { form } = $props();

	let errors = $state<Record<string, string[]>>({});
</script>

<AuthShell
	heading="Forgot your password?"
	subheading="We email you a link to choose a new one."
>
	{#if form?.sentTo}
		<EmptyState
			icon={MailCheckIcon}
			title="Check your inbox"
			subtitle="If {form.sentTo} has an account, a link is on its way. It works once, for an hour."
		/>
	{:else}
		<AuthForm
			submitLabel="Send the link"
			submitIcon={SendIcon}
			loading="Sending"
			success="Sent. Check your inbox."
			bind:errors
		>
			<Field.Field>
				<Field.Label for="email">Email</Field.Label>
				<Input
					id="email"
					name="email"
					type="email"
					autocomplete="username"
					inputmode="email"
					required
					class="h-11"
				/>
				<Field.Error errors={errors.email?.map((message) => ({ message }))} />
			</Field.Field>
		</AuthForm>
	{/if}
	{#snippet footer()}
		<a href={resolve("/auth/sign-in")} class="text-primary font-medium"
			>Back to sign-in</a
		>
	{/snippet}
</AuthShell>
