<script lang="ts">
	import { enhance } from "$app/forms";
	import CheckIcon from "@lucide/svelte/icons/check";

	import Picker from "#lib/components/picker.svelte";
	import SettingSwitch from "#lib/components/setting-switch.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { saveToast } from "#lib/toast.js";

	const { data } = $props();
</script>

<form
	method="POST"
	class="grid gap-6 lg:grid-cols-2 lg:items-start"
	use:enhance={saveToast("Access settings")}
>
	<section class="glass rounded-2xl p-4 md:p-6">
		<h2 class="mb-4 font-semibold">Joining</h2>
		<div class="divide-border divide-y">
			<SettingSwitch
				name="signUpsEnabled"
				label="Open sign-ups"
				description={data.emailConfigured
					? "Anyone can create an account after confirming their email. Off means invite only."
					: "Needs email to be set up, to confirm addresses. Until then, it's invite only."}
				checked={data.signUpsEnabled}
				disabled={!data.emailConfigured}
			/>
		</div>
	</section>
	<section class="glass rounded-2xl p-4 md:p-6">
		<h2 class="mb-4 font-semibold">Sign-in security</h2>
		<div class="divide-border divide-y">
			<SettingSwitch
				name="requireTwoFactor"
				label="Require an authenticator app"
				description="Everyone must set up a 6-digit code app before using LocalAssistant, you included."
				checked={data.requireTwoFactor}
			/>
			<SettingSwitch
				name="requirePasskey"
				label="Require a passkey"
				description="Everyone must register at least one passkey before using LocalAssistant."
				checked={data.requirePasskey}
			/>
		</div>
		<Field.Field class="mt-4">
			<Field.Label for="session-days">Sign people out after</Field.Label>
			<Picker
				id="session-days"
				name="sessionDays"
				label="Sign people out after"
				options={[
					{ value: "1", label: "A day without using it" },
					{ value: "7", label: "A week without using it" },
					{ value: "30", label: "A month without using it" },
				]}
				value={String(data.sessionDays)}
			/>
			<Field.Description
				>Devices already signed in switch over within a day.</Field.Description
			>
		</Field.Field>
	</section>
	<section class="glass rounded-2xl p-4 md:p-6">
		<h2 class="mb-4 font-semibold">Public address</h2>
		<Field.Field>
			<Field.Label for="public-origin">Address people open</Field.Label>
			<Input
				id="public-origin"
				name={data.originPinned ? undefined : "publicOrigin"}
				type="url"
				inputmode="url"
				value={data.publicOrigin}
				disabled={data.originPinned}
				placeholder="https://count.example"
				class="h-11"
			/>
			<Field.Description
				>{data.originPinned
					? "Set by ORIGIN on the server."
					: "Links in emails and passkeys use it, whatever address a request claims."}</Field.Description
			>
		</Field.Field>
	</section>
	<Button
		type="submit"
		class="h-11 justify-self-start rounded-xl px-5 lg:col-span-2"
	>
		<CheckIcon />
		Save
	</Button>
</form>
