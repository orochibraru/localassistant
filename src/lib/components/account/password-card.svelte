<script lang="ts">
	import { enhance } from "$app/forms";
	import CheckIcon from "@lucide/svelte/icons/check";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";

	import NewPasswordFields from "#lib/components/auth/new-password-fields.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Props {
		email: string;
		hasPassword: boolean;
	}

	const { email, hasPassword }: Props = $props();

	let errors = $state<Record<string, string[]>>({});
	let formKey = $state(0);
</script>

<section class="glass rounded-2xl p-4 md:p-6">
	<div class="flex items-start gap-3">
		<div
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
		>
			<KeyRoundIcon class="size-5" />
		</div>
		<div class="min-w-0 flex-1">
			<h2 class="font-semibold">Password</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{hasPassword
					? "Changing it signs you out on your other devices."
					: "You sign in without one. Set one to sign in with your email and a password too."}
			</p>
		</div>
	</div>
	{#key formKey}
		<form
			method="POST"
			action="?/changePassword"
			class="mt-5 flex flex-col gap-4"
			use:enhance={enhanceToast({
				loading: hasPassword
					? "Changing your password"
					: "Setting your password",
				success: hasPassword ? "Password changed." : "Password set.",
				onFailure: (result) =>
					(errors = (result?.errors as Record<string, string[]>) ?? {}),
				onSuccess: () => {
					errors = {};
					formKey += 1;
				},
			})}
		>
			<input
				type="email"
				name="username"
				value={email}
				autocomplete="username"
				class="sr-only"
				tabindex="-1"
				aria-hidden="true"
				readonly
			/>
			{#if hasPassword}
				<Field.Field>
					<Field.Label for="current-password">Current password</Field.Label>
					<Input
						id="current-password"
						name="currentPassword"
						type="password"
						autocomplete="current-password"
						required
						class="h-11"
					/>
					<Field.Error
						errors={errors.currentPassword?.map((message) => ({ message }))}
					/>
				</Field.Field>
			{/if}
			<NewPasswordFields {email} {errors} />
			<Button type="submit" class="h-11 self-start rounded-xl px-5">
				<CheckIcon />
				{hasPassword ? "Change password" : "Set password"}
			</Button>
		</form>
	{/key}
</section>
