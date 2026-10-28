<script lang="ts">
	import { enhance } from "$app/forms";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import FingerprintIcon from "@lucide/svelte/icons/fingerprint";
	import KeySquareIcon from "@lucide/svelte/icons/key-square";
	import LogInIcon from "@lucide/svelte/icons/log-in";
	import MailIcon from "@lucide/svelte/icons/mail";
	import MailCheckIcon from "@lucide/svelte/icons/mail-check";
	import SendIcon from "@lucide/svelte/icons/send";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { authClient } from "#lib/auth-client.js";
	import AuthShell from "#lib/components/auth-shell.svelte";
	import AuthForm from "#lib/components/auth/auth-form.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { keepRedirect } from "#lib/redirect-target.js";
	import { enhanceToast, toastError } from "#lib/toast.js";

	const { data } = $props();

	let errors = $state<Record<string, string[]>>({});
	let passkeyPending = $state(false);

	async function passkeySignInCallback() {
		passkeyPending = true;
		try {
			const result = await authClient.signIn.passkey();
			if (result?.error) {
				throw new Error(result.error.message ?? "That passkey didn't work.");
			}
			await goto(data.redirectTo, { invalidateAll: true });
		} finally {
			passkeyPending = false;
		}
	}

	function handlePasskeySignIn() {
		toast.promise(passkeySignInCallback(), {
			loading: "Waiting for your passkey",
			success: "Signed in.",
			error: (error: unknown) => toastError(error, "That passkey didn't work."),
		});
	}

	let emailOpen = $state(false);
	let emailStep = $state<"address" | "link" | "code">("address");
	let emailAddress = $state("");
	let emailErrors = $state<Record<string, string[]>>({});

	const byEmail = $derived(data.methods.magicLink || data.methods.emailCode);
	const alternatives = $derived(
		data.methods.passkey || data.methods.sso.length > 0 || byEmail,
	);

	function openEmail() {
		emailStep = "address";
		emailErrors = {};
		emailOpen = true;
	}

	const signInErrors: Record<string, string> = {
		method_off: "That sign-in method is turned off on this server.",
		not_found: "That sign-in link doesn't exist.",
		signup_disabled:
			"No account uses that email here. Ask an admin for an invite.",
		unable_to_create_user:
			"No account uses that email here. Ask an admin for an invite.",
		account_not_linked:
			"An account already uses that email: sign in to it, then link the provider from Security.",
		email_not_found:
			"The provider didn't share your email, so LocalAssistant can't find your account.",
		state_mismatch:
			"That sign-in took too long or was opened twice. Start it again.",
		please_restart_the_process:
			"That sign-in took too long or was opened twice. Start it again.",
	};

	onMount(() => {
		if (page.url.searchParams.get("reset") === "done") {
			toast.success("Password changed. Sign in with the new one.");
		}
		const failed = page.url.searchParams.get("error");
		if (failed) {
			toast.error(
				signInErrors[failed] ?? "The sign-in didn't go through. Try again.",
				{
					duration: 10_000,
				},
			);
		}
		if (page.url.searchParams.get("link") === "expired") {
			toast.error(
				"That sign-in link expired or was already used. Ask for a new one.",
			);
		}
	});
</script>

<AuthShell heading="Welcome back" subheading="Sign in to see who owes what.">
	{#if data.methods.password}
		<AuthForm
			action={keepRedirect("?/password", page.url)}
			submitLabel="Sign in"
			submitIcon={LogInIcon}
			loading="Signing in"
			success="Signed in."
			bind:errors
		>
			<Field.Field>
				<Field.Label for="email">Email</Field.Label>
				<Input
					id="email"
					name="email"
					type="email"
					autocomplete="username webauthn"
					inputmode="email"
					required
					class="h-11"
				/>
				<Field.Error errors={errors.email?.map((message) => ({ message }))} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="password">Password</Field.Label>
				<Input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="h-11"
				/>
				<Field.Error
					errors={errors.password?.map((message) => ({ message }))}
				/>
				{#if data.passwordReset}
					<a
						href={resolve("/auth/forgot-password")}
						class="text-primary flex min-h-11 items-center self-end text-sm font-medium"
						>Forgot your password?</a
					>
				{/if}
			</Field.Field>
		</AuthForm>
		{#if alternatives}
			<div class="text-muted-foreground my-5 flex items-center gap-3 text-xs">
				<span class="bg-border h-px flex-1"></span>
				or
				<span class="bg-border h-px flex-1"></span>
			</div>
		{/if}
	{/if}

	<div class="flex flex-col gap-3">
		{#if data.methods.passkey}
			<Button
				variant={data.methods.password ? "outline" : "default"}
				size="lg"
				class="h-12 w-full rounded-xl text-base {data.methods.password
					? ''
					: 'glow'}"
				onclick={handlePasskeySignIn}
				disabled={passkeyPending}
			>
				<FingerprintIcon />
				Sign in with a passkey
			</Button>
		{/if}
		{#if byEmail}
			<Button
				variant={data.methods.password || data.methods.passkey
					? "outline"
					: "default"}
				size="lg"
				class="h-12 w-full rounded-xl text-base"
				onclick={openEmail}
			>
				<MailIcon />
				Sign in by email
			</Button>
		{/if}
		{#each data.methods.sso as provider (provider.id)}
			<form
				method="POST"
				action={keepRedirect("?/sso", page.url)}
				use:enhance={enhanceToast({
					loading: `Opening ${provider.name}`,
					success: `Redirecting to ${provider.name}.`,
				})}
			>
				<input type="hidden" name="provider" value={provider.id} />
				<Button
					type="submit"
					variant="outline"
					size="lg"
					class="h-12 w-full rounded-xl text-base"
				>
					<KeySquareIcon />
					Continue with {provider.name}
				</Button>
			</form>
		{/each}
	</div>

	<ResponsiveSheet
		bind:open={emailOpen}
		title="Sign in by email"
		description={emailStep === "address"
			? "No password needed: we email you a way in."
			: undefined}
	>
		{#if emailStep === "address"}
			<form
				method="POST"
				class="flex flex-col gap-4 pb-4"
				use:enhance={enhanceToast({
					loading: "Sending",
					success: "Sent. Check your inbox.",
					onFailure: (result) =>
						(emailErrors = (result?.errors as Record<string, string[]>) ?? {}),
					onSuccess: (result) => {
						emailErrors = {};
						emailStep = result?.codeSent ? "code" : "link";
					},
				})}
			>
				<Field.Field>
					<Field.Label for="email-sign-in">Email</Field.Label>
					<Input
						id="email-sign-in"
						name="email"
						type="email"
						autocomplete="email"
						inputmode="email"
						required
						bind:value={emailAddress}
						class="h-11"
					/>
					<Field.Error
						errors={emailErrors.email?.map((message) => ({ message }))}
					/>
				</Field.Field>
				{#if data.methods.magicLink}
					<Button
						type="submit"
						formaction={keepRedirect("?/emailLink", page.url)}
						size="lg"
						class="glow h-12 rounded-xl text-base"
					>
						<SendIcon />
						Email me a link
					</Button>
				{/if}
				{#if data.methods.emailCode}
					<Button
						type="submit"
						formaction={keepRedirect("?/emailCode", page.url)}
						variant={data.methods.magicLink ? "outline" : "default"}
						size="lg"
						class="h-12 rounded-xl text-base"
					>
						<MailIcon />
						Email me a code
					</Button>
				{/if}
			</form>
		{:else if emailStep === "link"}
			<div class="flex flex-col items-center gap-3 pb-6 text-center">
				<span
					class="bg-accent text-accent-foreground flex size-14 items-center justify-center rounded-2xl"
				>
					<MailCheckIcon class="size-7" />
				</span>
				<p class="font-medium">Check your inbox</p>
				<p class="text-muted-foreground text-sm">
					If {emailAddress} has an account, a sign-in link is on its way. It works
					once, for 10 minutes.
				</p>
				<Button variant="ghost" onclick={() => (emailStep = "address")}
					>Use another email</Button
				>
			</div>
		{:else}
			<AuthForm
				action={keepRedirect("?/verifyCode", page.url)}
				submitLabel="Sign in"
				submitIcon={LogInIcon}
				loading="Checking the code"
				success="Signed in."
				bind:errors={emailErrors}
			>
				<input type="hidden" name="email" value={emailAddress} />
				<p class="text-muted-foreground text-sm">
					If {emailAddress} has an account, a 6-digit code is on its way. It expires
					in 10 minutes.
				</p>
				<Field.Field>
					<Field.Label for="email-code">Code</Field.Label>
					<Input
						id="email-code"
						name="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength={7}
						placeholder="123 456"
						required
						class="h-12 text-center text-xl tracking-[0.3em] tabular"
					/>
					<Field.Error
						errors={emailErrors.code?.map((message) => ({ message }))}
					/>
				</Field.Field>
			</AuthForm>
		{/if}
	</ResponsiveSheet>

	{#snippet footer()}
		{#if data.signUpsOpen}
			New here? <a
				href={resolve("/auth/sign-up")}
				class="text-primary font-medium">Create an account</a
			>
		{:else}
			This server is invite only. Ask an admin for an invite.
		{/if}
	{/snippet}
</AuthShell>
