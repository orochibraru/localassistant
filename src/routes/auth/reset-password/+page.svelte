<script lang="ts">
	import { resolve } from "$app/paths";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import LinkIcon from "@lucide/svelte/icons/link";

	import AuthShell from "#lib/components/auth-shell.svelte";
	import AuthForm from "#lib/components/auth/auth-form.svelte";
	import NewPasswordFields from "#lib/components/auth/new-password-fields.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";

	const { data } = $props();

	let errors = $state<Record<string, string[]>>({});
</script>

<AuthShell
	heading="Choose a new password"
	subheading={data.email
		? `For ${data.email}. It signs you out everywhere else.`
		: undefined}
>
	{#if data.email}
		<AuthForm
			submitLabel="Save the password"
			submitIcon={KeyRoundIcon}
			loading="Saving your password"
			success="Password changed. Sign in with it."
			bind:errors
		>
			<NewPasswordFields email={data.email} {errors} />
		</AuthForm>
	{:else}
		<EmptyState
			icon={LinkIcon}
			title="This link doesn't work anymore"
			subtitle="It expired or was already used. Ask for a new one."
		>
			<Button
				href={resolve("/auth/forgot-password")}
				size="lg"
				class="h-11 rounded-xl px-6">Get a new link</Button
			>
		</EmptyState>
	{/if}
</AuthShell>
