<script lang="ts">
	import { enhance } from "$app/forms";
	import CheckIcon from "@lucide/svelte/icons/check";
	import KeySquareIcon from "@lucide/svelte/icons/key-square";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PowerIcon from "@lucide/svelte/icons/power";
	import PowerOffIcon from "@lucide/svelte/icons/power-off";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import CopyField from "#lib/components/copy-field.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import ItemMenu from "#lib/components/item-menu.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import SettingSwitch from "#lib/components/setting-switch.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast, saveToast } from "#lib/toast.js";

	const { data } = $props();

	type Provider = (typeof data.providers)[number];

	let sheetOpen = $state(false);
	let editing = $state<Provider | undefined>();
	let errors = $state<Record<string, string[]>>({});

	function openProvider(provider?: Provider) {
		editing = provider;
		errors = {};
		sheetOpen = true;
	}
</script>

<div
	class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(20rem,28rem)_1fr] lg:items-start"
>
	<form
		method="POST"
		action="?/methods"
		class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6"
		use:enhance={saveToast("Sign-in methods")}
	>
		<div>
			<h2 class="text-lg font-semibold">Methods</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				What the sign-in page offers. Turning one off can't lock you out: you
				need another way in first.
			</p>
		</div>
		{#if data.methodsPinned}
			<p class="bg-accent text-accent-foreground rounded-xl px-4 py-3 text-sm">
				The server's <code>SIGN_IN_METHODS</code> sets these, whatever is saved here.
				Remove it from the server's environment to choose them here again.
			</p>
		{/if}
		<div class="divide-border divide-y">
			<SettingSwitch
				name="passwordSignIn"
				label="Email and password"
				description="Off makes everyone add a passkey or use single sign-on."
				checked={data.passwordSignIn}
				disabled={data.methodsPinned}
			/>
			<SettingSwitch
				name="passkeySignIn"
				label="Passkeys"
				description="Face ID, Touch ID, Windows Hello or a security key."
				checked={data.passkeySignIn}
				disabled={data.methodsPinned}
			/>
			<SettingSwitch
				name="magicLinkSignIn"
				label="Link by email"
				description={data.emailConfigured
					? "A one-time link that signs people in. Not for accounts with an authenticator app."
					: "Needs email delivery: set up SMTP in the email tab first."}
				checked={data.magicLinkSignIn}
				disabled={data.methodsPinned || !data.emailConfigured}
			/>
			<SettingSwitch
				name="emailCodeSignIn"
				label="Code by email"
				description={data.emailConfigured
					? "A 6-digit code to type in, handy when email opens on another device."
					: "Needs email delivery: set up SMTP in the email tab first."}
				checked={data.emailCodeSignIn}
				disabled={data.methodsPinned || !data.emailConfigured}
			/>
		</div>
		<Button
			type="submit"
			class="h-11 self-start rounded-xl px-5"
			disabled={data.methodsPinned}
		>
			<CheckIcon />
			Save
		</Button>
	</form>

	<section class="flex flex-col gap-3" aria-labelledby="sso-heading">
		<div class="flex items-center justify-between gap-3 px-1">
			<div>
				<h2 id="sso-heading" class="text-lg font-semibold">Single sign-on</h2>
				<p class="text-muted-foreground text-sm">
					Any OpenID Connect provider: Authentik, Keycloak, Google, Microsoft
					Entra.
				</p>
			</div>
			<Button
				class="glow h-10 shrink-0 rounded-xl px-4"
				onclick={() => openProvider()}
			>
				<PlusIcon />
				Add provider
			</Button>
		</div>
		{#if data.providers.length === 0}
			<div class="glass rounded-2xl">
				<EmptyState
					icon={KeySquareIcon}
					title="No providers yet"
					subtitle="Add one and its button shows up on the sign-in page."
				/>
			</div>
		{:else}
			<ul class="glass divide-border divide-y overflow-hidden rounded-2xl">
				{#each data.providers as provider (provider.id)}
					<li>
						<ItemMenu
							title={provider.name}
							class="min-h-16 px-3 py-2 md:px-4"
							actions={[
								{
									label: "Edit",
									icon: PencilIcon,
									onSelect: () => openProvider(provider),
								},
								{
									label: provider.enabled ? "Turn off" : "Turn on",
									icon: provider.enabled ? PowerOffIcon : PowerIcon,
									form: {
										action: "?/toggleProvider",
										fields: { id: provider.id },
										loading: "Updating provider",
										success: provider.enabled
											? `${provider.name} turned off.`
											: `${provider.name} turned on.`,
									},
								},
								{
									label: "Delete",
									icon: Trash2Icon,
									destructive: true,
									form: {
										action: "?/deleteProvider",
										fields: { id: provider.id },
										loading: "Deleting provider",
										success: "Provider deleted.",
										confirm: {
											title: `Delete ${provider.name}?`,
											description:
												"Its button leaves the sign-in page. Accounts that used it keep their other ways in.",
											confirmLabel: "Delete",
										},
									},
								},
							]}
						>
							<span
								class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
							>
								<KeySquareIcon class="size-5" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{provider.name}</span>
								<span class="text-muted-foreground block truncate text-sm"
									>{new URL(provider.discoveryUrl).host}</span
								>
							</span>
							<Badge variant={provider.enabled ? "default" : "secondary"}
								>{provider.enabled ? "On" : "Off"}</Badge
							>
						</ItemMenu>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<ResponsiveSheet
	bind:open={sheetOpen}
	title={editing ? `Edit ${editing.name}` : "Add a provider"}
>
	<form
		method="POST"
		action="?/saveProvider"
		class="flex flex-col gap-4 pb-4"
		use:enhance={enhanceToast({
			loading: "Checking the provider",
			success: "Provider saved.",
			onFailure: (result) =>
				(errors = (result?.errors as Record<string, string[]>) ?? {}),
			onSuccess: () => {
				sheetOpen = false;
			},
		})}
	>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
		{/if}
		<Field.Field>
			<Field.Label for="sso-name">Name on the button</Field.Label>
			<Input
				id="sso-name"
				name="name"
				value={editing?.name ?? ""}
				placeholder="Authentik"
				required
				maxlength={40}
				class="h-11"
			/>
			<Field.Error errors={errors.name?.map((message) => ({ message }))} />
		</Field.Field>
		<Field.Field>
			<Field.Label for="sso-discovery">Discovery URL</Field.Label>
			<Input
				id="sso-discovery"
				name="discoveryUrl"
				type="url"
				value={editing?.discoveryUrl ?? ""}
				placeholder="https://auth.example.com/application/o/localassistant/.well-known/openid-configuration"
				required
				class="h-11"
			/>
			<Field.Error
				errors={errors.discoveryUrl?.map((message) => ({ message }))}
			/>
		</Field.Field>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<Field.Field>
				<Field.Label for="sso-client-id">Client ID</Field.Label>
				<Input
					id="sso-client-id"
					name="clientId"
					value={editing?.clientId ?? ""}
					required
					autocomplete="off"
					class="h-11"
				/>
				<Field.Error
					errors={errors.clientId?.map((message) => ({ message }))}
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label for="sso-client-secret">Client secret</Field.Label>
				<Input
					id="sso-client-secret"
					name="clientSecret"
					type="password"
					autocomplete="off"
					placeholder={editing ? "Unchanged" : ""}
					required={!editing}
					class="h-11"
				/>
				<Field.Error
					errors={errors.clientSecret?.map((message) => ({ message }))}
				/>
			</Field.Field>
		</div>
		{#if editing}
			<Field.Field>
				<Field.Label>Redirect URI to register with the provider</Field.Label>
				<CopyField
					value="{data.callbackBase}{editing.id}"
					label="Copy redirect URI"
				/>
			</Field.Field>
		{:else}
			<p class="text-muted-foreground text-sm">
				The provider will ask for a redirect URI: <span class="font-medium"
					>{data.callbackBase}</span
				> followed by the provider's id, shown here once saved.
			</p>
		{/if}
		<Field.Field orientation="horizontal">
			<Checkbox
				id="sso-enabled"
				name="enabled"
				value="true"
				checked={editing?.enabled ?? true}
			/>
			<Field.Label for="sso-enabled" class="font-normal"
				>Show it on the sign-in page</Field.Label
			>
		</Field.Field>
		<Button type="submit" class="glow h-11 rounded-xl">
			<CheckIcon />
			{editing ? "Save provider" : "Add provider"}
		</Button>
	</form>
</ResponsiveSheet>
