<script lang="ts">
	import { enhance } from "$app/forms";
	import { resolve } from "$app/paths";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
	import SendIcon from "@lucide/svelte/icons/send";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import UserPlusIcon from "@lucide/svelte/icons/user-plus";

	import AuthShell from "#lib/components/auth-shell.svelte";
	import AuthForm from "#lib/components/auth/auth-form.svelte";
	import NewPasswordFields from "#lib/components/auth/new-password-fields.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();

	let errors = $state<Record<string, string[]>>({});

	const stepNumber = $derived({ email: 1, code: 2, details: 3 }[data.step]);
	const headings = {
		email: {
			heading: "Create your account",
			subheading: "Start with your email. We'll send a code to confirm it.",
		},
		code: { heading: "Check your email", subheading: "" },
		details: {
			heading: "Almost there",
			subheading: "Pick your name and a strong password.",
		},
	};
	const subheading = $derived(
		data.step === "code"
			? `We sent a 6-digit code to ${data.email}.`
			: headings[data.step].subheading,
	);
</script>

<AuthShell heading={headings[data.step].heading} {subheading}>
	<ol class="mb-8 flex gap-2" aria-label="Step {stepNumber} of 3">
		{#each [1, 2, 3] as step (step)}
			<li
				class="h-1.5 flex-1 rounded-full transition-colors duration-300 {step <=
				stepNumber
					? 'bg-primary'
					: 'bg-muted'}"
			></li>
		{/each}
	</ol>

	{#if data.step === "email"}
		<AuthForm
			action="?/start"
			submitLabel="Send the code"
			submitIcon={SendIcon}
			loading="Sending the code"
			success="Code sent."
			bind:errors
		>
			<Field.Field>
				<Field.Label for="email">Email</Field.Label>
				<Input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					inputmode="email"
					required
					class="h-11"
				/>
				<Field.Error errors={errors.email?.map((message) => ({ message }))} />
			</Field.Field>
		</AuthForm>
	{:else if data.step === "code"}
		<AuthForm
			action="?/verify"
			submitLabel="Verify"
			submitIcon={ShieldCheckIcon}
			loading="Checking the code"
			success="Email confirmed."
			bind:errors
		>
			<Field.Field>
				<Field.Label for="code">Code from the email</Field.Label>
				<Input
					id="code"
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
		<div class="mt-4 flex justify-between">
			<form
				method="POST"
				action="?/restart"
				use:enhance={enhanceToast({
					loading: "Going back",
					success: "Enter your email.",
				})}
			>
				<Button type="submit" variant="link" class="px-0"
					><PencilIcon />Change email</Button
				>
			</form>
			<form
				method="POST"
				action="?/resend"
				use:enhance={enhanceToast({
					loading: "Sending a new code",
					success: "New code sent.",
				})}
			>
				<Button type="submit" variant="link" class="px-0"
					><RotateCwIcon />Send a new code</Button
				>
			</form>
		</div>
	{:else}
		<AuthForm
			action="?/create"
			submitLabel="Create account"
			submitIcon={UserPlusIcon}
			loading="Creating your account"
			success="Welcome to LocalAssistant."
			bind:errors
		>
			<Field.Field>
				<Field.Label for="email-confirmed">Email</Field.Label>
				<Input
					id="email-confirmed"
					value={data.email}
					type="email"
					autocomplete="username"
					readonly
					class="h-11"
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label for="name">Name</Field.Label>
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
			<NewPasswordFields email={data.email} {errors} />
		</AuthForm>
	{/if}

	{#snippet footer()}
		Already have an account? <a
			href={resolve("/auth/sign-in")}
			class="text-primary font-medium">Sign in</a
		>
	{/snippet}
</AuthShell>
