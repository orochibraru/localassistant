<script lang="ts">
	import { enhance } from "$app/forms";
	import PowerOffIcon from "@lucide/svelte/icons/power-off";
	import QrCodeIcon from "@lucide/svelte/icons/qr-code";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";

	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Setup {
		qrCode: string;
		secret: string;
		backupCodes: string[];
	}

	const { enabled }: { enabled: boolean } = $props();

	let setup = $state<Setup | undefined>();
</script>

<section class="glass rounded-2xl p-4 md:p-6">
	<div class="flex items-start gap-3">
		<div
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
		>
			<ShieldCheckIcon class="size-5" />
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<h2 class="font-semibold">Authenticator app</h2>
				<Badge variant={enabled ? "default" : "secondary"}
					>{enabled ? "On" : "Off"}</Badge
				>
			</div>
			<p class="text-muted-foreground mt-1 text-sm">
				A 6-digit code from an app like 1Password, Aegis or Google
				Authenticator, asked at sign-in.
			</p>
		</div>
	</div>

	{#if setup}
		<div class="mt-6 flex flex-col gap-5">
			<div
				class="flex flex-col items-center gap-3 md:flex-row md:items-start md:gap-6"
			>
				<div class="size-48 shrink-0 rounded-xl bg-white p-2 [&_svg]:size-full">
					{@html setup.qrCode}
				</div>
				<div class="min-w-0 text-sm">
					<p>Scan the code with your app, or enter this key:</p>
					<p
						class="bg-muted mt-2 rounded-lg px-3 py-2 font-mono text-xs break-all select-all"
					>
						{setup.secret}
					</p>
					<p class="mt-4 font-medium">Backup codes</p>
					<p class="text-muted-foreground">
						Each works once if you lose your device. Keep them somewhere safe.
					</p>
					<ul
						class="bg-muted mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg px-3 py-2 font-mono text-xs select-all"
					>
						{#each setup.backupCodes as code (code)}
							<li>{code}</li>
						{/each}
					</ul>
				</div>
			</div>
			<form
				method="POST"
				action="?/verifyTwoFactor"
				class="flex flex-col gap-3 md:flex-row md:items-end"
				use:enhance={enhanceToast({
					loading: "Checking the code",
					success: "Two-factor authentication is on.",
					onSuccess: () => {
						setup = undefined;
					},
				})}
			>
				<Field.Field class="md:w-48">
					<Field.Label for="totp-code">Code from the app</Field.Label>
					<Input
						id="totp-code"
						name="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength={6}
						required
						class="h-11 font-mono tracking-widest"
					/>
				</Field.Field>
				<Button type="submit" class="h-11 rounded-xl px-5"
					><ShieldCheckIcon />Turn on</Button
				>
			</form>
		</div>
	{:else}
		<form
			method="POST"
			action={enabled ? "?/disableTwoFactor" : "?/enableTwoFactor"}
			class="mt-5 flex flex-col gap-3 md:flex-row md:items-end"
			use:enhance={enhanceToast({
				loading: enabled ? "Turning it off" : "Preparing the setup",
				success: enabled
					? "Two-factor authentication is off."
					: "Scan the code to finish.",
				onSuccess: (data) => {
					setup = data?.setup as Setup | undefined;
				},
			})}
		>
			<Field.Field class="md:w-64">
				<Field.Label for="two-factor-password"
					>Confirm your password</Field.Label
				>
				<Input
					id="two-factor-password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="h-11"
				/>
			</Field.Field>
			<Button
				type="submit"
				variant={enabled ? "outline" : "default"}
				class="h-11 rounded-xl px-5"
			>
				{#if enabled}<PowerOffIcon />{:else}<QrCodeIcon />{/if}
				{enabled ? "Turn off" : "Set up"}
			</Button>
		</form>
	{/if}
</section>
