<script lang="ts">
	import { enhance } from "$app/forms";
	import CheckIcon from "@lucide/svelte/icons/check";
	import MailIcon from "@lucide/svelte/icons/mail";
	import SendIcon from "@lucide/svelte/icons/send";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import XIcon from "@lucide/svelte/icons/x";

	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast, saveToast } from "#lib/toast.js";

	const { data } = $props();

	let emailOpen = $state(false);
	let newEmail = $state("");
	let codeSent = $state(false);
	let emailErrors = $state<Record<string, string[]>>({});

	let deleteOpen = $state(false);
	let deleteErrors = $state<Record<string, string[]>>({});

	function openEmailChange() {
		newEmail = "";
		codeSent = false;
		emailErrors = {};
		emailOpen = true;
	}

	const failureInto =
		(target: "email" | "delete") =>
		(result: Record<string, unknown> | undefined) => {
			const errors = (result?.errors as Record<string, string[]>) ?? {};
			if (target === "email") {
				emailErrors = errors;
			} else {
				deleteErrors = errors;
			}
		};
</script>

<div class="flex max-w-3xl flex-col gap-6">
	<form
		method="POST"
		action="?/profile"
		class="glass flex flex-col gap-5 rounded-2xl p-4 md:p-6"
		use:enhance={saveToast("Profile")}
	>
		<Field.Field>
			<Field.Label for="profile-name">Name</Field.Label>
			<Input
				id="profile-name"
				name="name"
				value={data.user.name}
				autocomplete="name"
				required
				maxlength={80}
				class="h-11"
			/>
		</Field.Field>
		<Field.Field>
			<Field.Label for="profile-email">Email</Field.Label>
			<div class="flex gap-2">
				<Input
					id="profile-email"
					value={data.user.email}
					disabled
					class="h-11 flex-1"
				/>
				{#if data.emailChangeAvailable}
					<Button
						variant="outline"
						class="h-11 rounded-xl"
						onclick={openEmailChange}
					>
						<MailIcon />
						Change
					</Button>
				{/if}
			</div>
			{#if !data.emailChangeAvailable}
				<Field.Description>Ask an admin to change it.</Field.Description>
			{/if}
		</Field.Field>
		<Button type="submit" class="h-11 self-start rounded-xl px-5">
			<CheckIcon />
			Save
		</Button>
	</form>

	<section class="glass flex flex-col gap-3 rounded-2xl p-4 md:p-6">
		<h2 class="text-lg font-semibold">Delete your account</h2>
		<p class="text-muted-foreground text-sm">
			{data.lastAdmin
				? "You're the only admin. Make someone else admin before you go."
				: "Your sign-in, sessions and security keys go."}
		</p>
		<Button
			variant="destructive"
			class="h-11 self-start rounded-xl px-5"
			disabled={data.lastAdmin}
			onclick={() => {
				deleteErrors = {};
				deleteOpen = true;
			}}
		>
			<Trash2Icon />
			Delete account
		</Button>
	</section>
</div>

<ResponsiveSheet
	bind:open={emailOpen}
	title="Change your email"
	description={codeSent
		? `Enter the code we sent to ${newEmail}.`
		: "We send a code to the new address to check it's yours."}
>
	{#if codeSent}
		<form
			method="POST"
			action="?/confirmEmailChange"
			class="flex flex-col gap-4 pb-4"
			use:enhance={enhanceToast({
				loading: "Checking the code",
				success: "Email changed.",
				onFailure: failureInto("email"),
				onSuccess: () => {
					emailOpen = false;
				},
			})}
		>
			<input type="hidden" name="email" value={newEmail} />
			<Field.Field>
				<Field.Label for="email-change-code">Code</Field.Label>
				<Input
					id="email-change-code"
					name="code"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={7}
					required
					class="h-11 font-mono tracking-widest"
				/>
				<Field.Error
					errors={emailErrors.code?.map((message) => ({ message }))}
				/>
			</Field.Field>
			<Button type="submit" class="h-11 rounded-xl">
				<CheckIcon />
				Confirm
			</Button>
		</form>
	{:else}
		<form
			method="POST"
			action="?/requestEmailChange"
			class="flex flex-col gap-4 pb-4"
			use:enhance={enhanceToast({
				loading: "Sending the code",
				success: "Code sent. Check that inbox.",
				onFailure: failureInto("email"),
				onSuccess: () => {
					emailErrors = {};
					codeSent = true;
				},
			})}
		>
			<Field.Field>
				<Field.Label for="new-email">New email</Field.Label>
				<Input
					id="new-email"
					name="email"
					type="email"
					inputmode="email"
					autocomplete="email"
					required
					bind:value={newEmail}
					class="h-11"
				/>
				<Field.Error
					errors={emailErrors.email?.map((message) => ({ message }))}
				/>
			</Field.Field>
			<Button type="submit" class="h-11 rounded-xl">
				<SendIcon />
				Send the code
			</Button>
		</form>
	{/if}
</ResponsiveSheet>

<ResponsiveSheet
	bind:open={deleteOpen}
	title="Delete your account?"
	description="This can't be undone."
>
	<form
		method="POST"
		action="?/deleteAccount"
		class="flex flex-col gap-4 pb-4"
		use:enhance={enhanceToast({
			loading: "Deleting your account",
			success: "Account deleted.",
			onFailure: failureInto("delete"),
		})}
	>
		{#if data.hasPassword}
			<Field.Field>
				<Field.Label for="delete-password">Confirm your password</Field.Label>
				<Input
					id="delete-password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="h-11"
				/>
				<Field.Error
					errors={deleteErrors.password?.map((message) => ({ message }))}
				/>
			</Field.Field>
		{/if}
		<div class="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
			<Button
				variant="outline"
				class="h-11 rounded-xl"
				onclick={() => (deleteOpen = false)}><XIcon />Cancel</Button
			>
			<Button type="submit" variant="destructive" class="h-11 rounded-xl">
				<Trash2Icon />
				Delete my account
			</Button>
		</div>
	</form>
</ResponsiveSheet>
