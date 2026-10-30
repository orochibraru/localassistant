<script lang="ts">
	import { enhance } from "$app/forms";
	import CheckIcon from "@lucide/svelte/icons/check";
	import FingerprintIcon from "@lucide/svelte/icons/fingerprint";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import MailIcon from "@lucide/svelte/icons/mail";
	import RotateCcwKeyIcon from "@lucide/svelte/icons/rotate-ccw-key";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import ShieldMinusIcon from "@lucide/svelte/icons/shield-minus";
	import ShieldPlusIcon from "@lucide/svelte/icons/shield-plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import ItemMenu, { type MenuAction } from "#lib/components/item-menu.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();

	let editing = $state<{ id: string; name: string; email: string }>();
	let emailOpen = $state(false);
	let emailErrors = $state<Record<string, string[]>>({});

	function actionsFor(user: (typeof data.users)[number]): MenuAction[] {
		const self = user.id === data.user.id;
		const actions: MenuAction[] = [];
		if (!self) {
			actions.push(
				user.role === "admin"
					? {
							label: "Remove admin role",
							icon: ShieldMinusIcon,
							form: {
								action: "?/demote",
								fields: { id: user.id },
								loading: "Updating role",
								success: "Admin role removed.",
								confirm: {
									title: `Remove ${user.name}'s admin role?`,
									description:
										"They keep their account but lose the admin area.",
									confirmLabel: "Remove admin",
								},
							},
						}
					: {
							label: "Make admin",
							icon: ShieldPlusIcon,
							form: {
								action: "?/promote",
								fields: { id: user.id },
								loading: "Updating role",
								success: `${user.name} is now an admin.`,
								confirm: {
									title: `Make ${user.name} an admin?`,
									description:
										"Admins manage invites, sign-in methods, email and every account, yours included.",
									confirmLabel: "Make admin",
								},
							},
						},
			);
		}
		actions.push({
			label: "Change email",
			icon: MailIcon,
			onSelect: () => {
				editing = user;
				emailErrors = {};
				emailOpen = true;
			},
		});
		if (!self && (user.twoFactorEnabled || user.passkeyCount > 0)) {
			actions.push({
				label: "Reset two-factor and passkeys",
				icon: RotateCcwKeyIcon,
				form: {
					action: "?/resetFactors",
					fields: { id: user.id },
					loading: "Resetting their factors",
					success: `${user.name} can sign in with their password again.`,
					confirm: {
						title: `Reset ${user.name}'s two-factor and passkeys?`,
						description:
							"Their authenticator app and every passkey are removed and they're signed out everywhere. If you require factors, they set them up again at their next sign-in.",
						confirmLabel: "Reset",
					},
				},
			});
		}
		actions.push({
			label: "Sign out everywhere",
			icon: LogOutIcon,
			form: {
				action: "?/revokeSessions",
				fields: { id: user.id },
				loading: "Signing out",
				success: "Signed out everywhere.",
				confirm: {
					title: `Sign ${user.name} out everywhere?`,
					description:
						"Every session on every device ends. They can sign in again.",
					confirmLabel: "Sign out",
				},
			},
		});
		if (!self) {
			actions.push({
				label: "Delete account",
				icon: Trash2Icon,
				destructive: true,
				form: {
					action: "?/delete",
					fields: { id: user.id },
					loading: "Deleting account",
					success: "Account deleted.",
					confirm: {
						title: `Delete ${user.name}'s account?`,
						description:
							"Their sign-in, sessions and security keys are deleted. This can't be undone.",
						confirmLabel: "Delete",
					},
				},
			});
		}
		return actions;
	}
</script>

<ul
	class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(22rem,1fr))]"
	aria-label="Accounts"
>
	{#each data.users as user (user.id)}
		<li class="glass rounded-2xl">
			<ItemMenu title={user.name} actions={actionsFor(user)} class="p-3 pr-2">
				<span
					class="from-primary flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br to-[oklch(0.62_0.14_calc(var(--hue)+70))] font-semibold text-white"
					aria-hidden="true"
				>
					{user.name.slice(0, 1).toUpperCase()}
				</span>
				<span class="min-w-0 flex-1">
					<span class="flex items-center gap-2 font-medium">
						<span class="truncate">{user.name}</span>
						{#if user.role === "admin"}<Badge>Admin</Badge>{/if}
						{#if user.id === data.user.id}<Badge variant="secondary">You</Badge
							>{/if}
					</span>
					<span class="text-muted-foreground block truncate text-sm"
						>{user.email}</span
					>
					<span class="mt-1.5 flex flex-wrap gap-1.5">
						<Badge variant={user.twoFactorEnabled ? "default" : "outline"}>
							<ShieldCheckIcon />
							{user.twoFactorEnabled ? "Authenticator on" : "No authenticator"}
						</Badge>
						<Badge variant={user.passkeyCount > 0 ? "default" : "outline"}>
							<FingerprintIcon />
							{user.passkeyCount}
							{user.passkeyCount === 1 ? "passkey" : "passkeys"}
						</Badge>
					</span>
				</span>
			</ItemMenu>
		</li>
	{/each}
</ul>

{#if editing}
	<ResponsiveSheet bind:open={emailOpen} title="Change {editing.name}'s email">
		<form
			method="POST"
			action="?/changeEmail"
			class="flex flex-col gap-4 pb-4"
			use:enhance={enhanceToast({
				loading: "Changing the email",
				success: "Email changed.",
				onFailure: (result) =>
					(emailErrors = (result?.errors as Record<string, string[]>) ?? {}),
				onSuccess: () => {
					emailOpen = false;
				},
			})}
		>
			<input type="hidden" name="id" value={editing.id} />
			<Field.Field>
				<Field.Label for="admin-user-email">Email</Field.Label>
				<Input
					id="admin-user-email"
					name="email"
					type="email"
					inputmode="email"
					value={editing.email}
					required
					class="h-11"
				/>
				<Field.Description
					>They sign in with it from now on. No confirmation is sent.</Field.Description
				>
				<Field.Error
					errors={emailErrors.email?.map((message) => ({ message }))}
				/>
			</Field.Field>
			<Button type="submit" class="h-11 rounded-xl">
				<CheckIcon />
				Save email
			</Button>
		</form>
	</ResponsiveSheet>
{/if}
