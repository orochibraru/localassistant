<script lang="ts">
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	import PasskeysCard from "#lib/components/account/passkeys-card.svelte";
	import PasswordCard from "#lib/components/account/password-card.svelte";
	import SessionsCard from "#lib/components/account/sessions-card.svelte";
	import TwoFactorCard from "#lib/components/account/two-factor-card.svelte";
	import * as Alert from "#lib/components/ui/alert/index.js";

	const { data } = $props();

	const labels = {
		"two-factor": "an authenticator app",
		passkey: "a passkey",
	} as const;
</script>

<div class="grid gap-6 lg:grid-cols-2 lg:items-start">
	{#if data.missing.length > 0}
		<Alert.Root class="lg:col-span-2">
			<TriangleAlertIcon />
			<Alert.Title>Your admin requires more security</Alert.Title>
			<Alert.Description>
				Set up {data.missing.map((factor) => labels[factor]).join(" and ")} to keep
				using LocalAssistant.
			</Alert.Description>
		</Alert.Root>
	{/if}
	<PasswordCard email={data.user.email} hasPassword={data.hasPassword} />
	<TwoFactorCard enabled={data.twoFactorEnabled} />
	<PasskeysCard passkeys={data.passkeys} />
	<SessionsCard sessions={data.sessions} currentId={data.currentSessionId} />
</div>
