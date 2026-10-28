<script lang="ts">
	import { enhance } from "$app/forms";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import ServerIcon from "@lucide/svelte/icons/server";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";

	import AuthShell from "#lib/components/auth-shell.svelte";
	import AuthForm from "#lib/components/auth/auth-form.svelte";
	import NewPasswordFields from "#lib/components/auth/new-password-fields.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();

	let errors = $state<Record<string, string[]>>({});
	let email = $state("");

	const stepNumber = $derived(data.step === "code" ? 1 : 2);
</script>

<AuthShell
	heading="Welcome to LocalAssistant"
	subheading={data.step === "code"
		? "This server has no accounts yet. First, prove you run it."
		: "Now create the admin account. It manages invites, email and security."}
>
	<ol class="mb-8 flex gap-2" aria-label="Step {stepNumber} of 2">
		{#each [1, 2] as step (step)}
			<li
				class="h-1.5 flex-1 rounded-full transition-colors duration-300 {step <=
				stepNumber
					? 'bg-primary'
					: 'bg-muted'}"
			></li>
		{/each}
	</ol>

	{#if data.step === "code"}
		<div class="bg-muted mb-6 flex gap-3 rounded-xl p-4 text-sm">
			<ServerIcon class="text-muted-foreground mt-0.5 size-5 shrink-0" />
			<p>
				A 6-digit setup code is in the server log, on a line starting with <span
					class="font-medium">Setup code</span
				>. With Docker:
				<code class="bg-background rounded px-1 py-0.5 text-xs"
					>docker compose logs localassistant</code
				>
			</p>
		</div>
		<AuthForm
			action="?/verify"
			submitLabel="Continue"
			submitIcon={ArrowRightIcon}
			loading="Checking the code"
			success="Code accepted."
			bind:errors
		>
			<Field.Field>
				<Field.Label for="setup-code">Setup code</Field.Label>
				<Input
					id="setup-code"
					name="code"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={7}
					required
					class="h-14 text-center font-mono text-2xl tracking-[0.5em]"
				/>
				<Field.Error errors={errors.code?.map((message) => ({ message }))} />
			</Field.Field>
		</AuthForm>
		<form
			method="POST"
			action="?/newCode"
			class="mt-4 text-center"
			use:enhance={enhanceToast({
				loading: "Printing a new code",
				success: "New code printed in the server log.",
			})}
		>
			<Button type="submit" variant="link">Code expired? Print a new one</Button
			>
		</form>
	{:else}
		<AuthForm
			action="?/create"
			submitLabel="Create the admin account"
			submitIcon={ShieldCheckIcon}
			loading="Creating your account"
			success="Welcome, admin."
			bind:errors
		>
			<Field.Field>
				<Field.Label for="setup-email">Email</Field.Label>
				<Input
					id="setup-email"
					name="email"
					type="email"
					autocomplete="email"
					inputmode="email"
					required
					bind:value={email}
					class="h-11"
				/>
				<Field.Description
					>This account becomes the admin. You can make others admins later.</Field.Description
				>
				<Field.Error errors={errors.email?.map((message) => ({ message }))} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="name">Your name</Field.Label>
				<Input
					id="name"
					name="name"
					autocomplete="name"
					required
					maxlength={80}
					class="h-11"
				/>
				<Field.Error errors={errors.name?.map((message) => ({ message }))} />
			</Field.Field>
			<NewPasswordFields {email} {errors} />
		</AuthForm>
	{/if}
</AuthShell>
