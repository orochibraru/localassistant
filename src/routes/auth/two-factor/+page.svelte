<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import FingerprintIcon from "@lucide/svelte/icons/fingerprint";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import { toast } from "svelte-sonner";

	import { authClient } from "#lib/auth-client.js";
	import AuthShell from "#lib/components/auth-shell.svelte";
	import AuthForm from "#lib/components/auth/auth-form.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { keepRedirect } from "#lib/redirect-target.js";
	import { trustThisDevice } from "#lib/remote/two-factor.remote.js";
	import { toastError } from "#lib/toast.js";

	const { data } = $props();

	let errors = $state<Record<string, string[]>>({});
	let useBackupCode = $state(false);
	let passkeyPending = $state(false);
	let trusted = $state(false);

	async function passkeySignInCallback() {
		passkeyPending = true;
		try {
			const result = await authClient.signIn.passkey();
			if (result?.error) {
				throw new Error(result.error.message ?? "That passkey didn't work.");
			}
			if (trusted) {
				await trustThisDevice();
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
</script>

<AuthShell
	heading="Two-step check"
	subheading={useBackupCode
		? "Enter one of your backup codes."
		: "Enter the 6-digit code from your authenticator app."}
>
	{#if useBackupCode}
		<AuthForm
			action={keepRedirect("?/backup", page.url)}
			submitLabel="Verify"
			submitIcon={ShieldCheckIcon}
			loading="Checking"
			success="Signed in."
			bind:errors
		>
			<input type="hidden" name="trustDevice" value={String(trusted)} />
			<Field.Field>
				<Field.Label for="backup-code">Backup code</Field.Label>
				<Input
					id="backup-code"
					name="code"
					autocomplete="one-time-code"
					required
					class="h-11 font-mono"
				/>
				<Field.Error errors={errors.code?.map((message) => ({ message }))} />
			</Field.Field>
		</AuthForm>
	{:else}
		<AuthForm
			action={keepRedirect("?/totp", page.url)}
			submitLabel="Verify"
			submitIcon={ShieldCheckIcon}
			loading="Checking"
			success="Signed in."
			bind:errors
		>
			<input type="hidden" name="trustDevice" value={String(trusted)} />
			<Field.Field>
				<Field.Label for="totp">Code</Field.Label>
				<Input
					id="totp"
					name="code"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={6}
					required
					class="h-14 text-center font-mono text-2xl tracking-[0.5em]"
				/>
				<Field.Error errors={errors.code?.map((message) => ({ message }))} />
			</Field.Field>
		</AuthForm>
	{/if}
	<Field.Field orientation="horizontal" class="mt-4">
		<Checkbox id="trust-device" bind:checked={trusted} />
		<Field.Label for="trust-device" class="font-normal"
			>Trust this device for 30 days</Field.Label
		>
	</Field.Field>
	{#if data.passkey}
		<Button
			variant="outline"
			size="lg"
			class="mt-4 h-12 w-full rounded-xl text-base"
			onclick={handlePasskeySignIn}
			disabled={passkeyPending}
		>
			<FingerprintIcon />
			Use a passkey instead
		</Button>
	{/if}
	<Button
		variant="link"
		class="mt-2 w-full"
		onclick={() => (useBackupCode = !useBackupCode)}
	>
		{useBackupCode
			? "Use the authenticator app"
			: "Lost your device? Use a backup code"}
	</Button>
	{#snippet footer()}
		<a href={resolve("/auth/sign-in")} class="text-primary font-medium"
			>Back to sign in</a
		>
	{/snippet}
</AuthShell>
