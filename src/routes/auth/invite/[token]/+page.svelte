<script lang="ts">
	import UserPlusIcon from "@lucide/svelte/icons/user-plus";

	import AuthShell from "#lib/components/auth-shell.svelte";
	import AuthForm from "#lib/components/auth/auth-form.svelte";
	import NewPasswordFields from "#lib/components/auth/new-password-fields.svelte";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";

	const { data } = $props();

	let errors = $state<Record<string, string[]>>({});
</script>

<AuthShell
	heading="You're invited"
	subheading={data.invitedByName
		? `${data.invitedByName} invited you to LocalAssistant.`
		: "Create your LocalAssistant account."}
>
	<AuthForm
		submitLabel="Create account"
		submitIcon={UserPlusIcon}
		loading="Creating your account"
		success="Welcome to LocalAssistant."
		bind:errors
	>
		<Field.Field>
			<Field.Label for="invite-email">Email</Field.Label>
			<Input
				id="invite-email"
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
</AuthShell>
