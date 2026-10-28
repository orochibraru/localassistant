<script lang="ts">
	import { enhance } from "$app/forms";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import SendIcon from "@lucide/svelte/icons/send";
	import XIcon from "@lucide/svelte/icons/x";

	import CopyField from "#lib/components/copy-field.svelte";
	import ItemMenu from "#lib/components/item-menu.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();

	let created = $state<{ link: string; emailed: boolean } | undefined>();
	let errors = $state<Record<string, string[]>>({});

	function statusOf(invite: (typeof data.invites)[number]): {
		label: string;
		active: boolean;
	} {
		if (invite.acceptedAt) {
			return { label: "Accepted", active: false };
		}
		return new Date(invite.expiresAt) < new Date()
			? { label: "Expired", active: false }
			: { label: "Pending", active: true };
	}
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(20rem,28rem)_1fr] lg:items-start">
	<form
		method="POST"
		action="?/create"
		class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6"
		use:enhance={enhanceToast({
			loading: "Creating invite",
			success: (result) =>
				result?.emailed ? "Invite sent." : "Invite created. Share the link.",
			reset: true,
			onFailure: (result) =>
				(errors = (result?.errors as Record<string, string[]>) ?? {}),
			onSuccess: (result) => {
				errors = {};
				created = result as { link: string; emailed: boolean };
			},
		})}
	>
		<div>
			<h2 class="font-semibold">Invite someone</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{data.emailConfigured
					? "They get an email with a link to create their account. It expires in 7 days."
					: "Email isn't set up, so share the link yourself. It expires in 7 days."}
			</p>
		</div>
		<div class="flex flex-col gap-3 md:flex-row md:items-start">
			<Field.Field class="flex-1">
				<Field.Label for="invite-email" class="sr-only">Email</Field.Label>
				<Input
					id="invite-email"
					name="email"
					type="email"
					inputmode="email"
					placeholder="friend@example.com"
					required
					class="h-11"
				/>
				<Field.Error errors={errors.email?.map((message) => ({ message }))} />
			</Field.Field>
			<Button type="submit" class="h-11 rounded-xl px-5"
				><SendIcon />Invite</Button
			>
		</div>
		{#if created}
			<CopyField value={created.link} label="Copy invite link" />
		{/if}
	</form>

	{#if data.invites.length > 0}
		<ul class="glass divide-border divide-y rounded-2xl">
			{#each data.invites as invite (invite.id)}
				{@const status = statusOf(invite)}
				<li>
					<ItemMenu
						title={invite.email}
						class="min-h-16 px-3 py-2 md:px-4"
						actions={invite.acceptedAt
							? [
									{
										label: "Copy email",
										icon: CopyIcon,
										onSelect: () => navigator.clipboard.writeText(invite.email),
									},
								]
							: [
									{
										label: "Copy email",
										icon: CopyIcon,
										onSelect: () => navigator.clipboard.writeText(invite.email),
									},
									{
										label: "Revoke invite",
										icon: XIcon,
										destructive: true,
										form: {
											action: "?/revoke",
											fields: { id: invite.id },
											loading: "Revoking invite",
											success: "Invite revoked.",
											confirm: {
												title: `Revoke the invite for ${invite.email}?`,
												description: "The link stops working right away.",
												confirmLabel: "Revoke",
											},
										},
									},
								]}
					>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium">{invite.email}</span>
							<span class="text-muted-foreground block truncate text-xs">
								{invite.invitedByName
									? `Invited by ${invite.invitedByName} on `
									: "Invited on "}{new Date(
									invite.createdAt,
								).toLocaleDateString()}
							</span>
						</span>
						<Badge variant={status.active ? "default" : "secondary"}
							>{status.label}</Badge
						>
					</ItemMenu>
				</li>
			{/each}
		</ul>
	{/if}
</div>
