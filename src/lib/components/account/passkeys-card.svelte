<script lang="ts">
	import { enhance } from "$app/forms";
	import { invalidateAll } from "$app/navigation";
	import FingerprintIcon from "@lucide/svelte/icons/fingerprint";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { authClient } from "#lib/auth-client.js";
	import ItemMenu from "#lib/components/item-menu.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { enhanceToast, toastError } from "#lib/toast.js";

	interface Passkey {
		id: string;
		name: string | null;
		deviceType: string;
		createdAt: Date | null;
	}

	const { passkeys }: { passkeys: Passkey[] } = $props();

	let adding = $state(false);

	async function addPasskeyCallback() {
		adding = true;
		try {
			const result = await authClient.passkey.addPasskey({
				name: navigator.platform || "Passkey",
			});
			if (result?.error) {
				throw new Error(result.error.message ?? "The passkey wasn't saved.");
			}
			await invalidateAll();
		} finally {
			adding = false;
		}
	}

	function handleAddPasskey() {
		toast.promise(addPasskeyCallback(), {
			loading: "Waiting for your device",
			success: "Passkey added.",
			error: (error: unknown) => toastError(error, "The passkey wasn't saved."),
		});
	}
</script>

<section class="glass rounded-2xl p-4 md:p-6">
	<div class="flex items-start gap-3">
		<div
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
		>
			<FingerprintIcon class="size-5" />
		</div>
		<div class="min-w-0 flex-1">
			<h2 class="font-semibold">Passkeys</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Sign in with Face ID, Touch ID, Windows Hello or a security key instead
				of a password.
			</p>
		</div>
	</div>

	{#if passkeys.length > 0}
		<ul class="divide-border mt-5 divide-y rounded-xl border">
			{#each passkeys as entry (entry.id)}
				<li>
					<ItemMenu
						title={entry.name ?? "Passkey"}
						class="px-3 py-2"
						actions={[
							{
								label: "Remove",
								icon: Trash2Icon,
								destructive: true,
								form: {
									action: "?/deletePasskey",
									fields: { id: entry.id },
									loading: "Removing passkey",
									success: "Passkey removed.",
									confirm: {
										title: `Remove ${entry.name ?? "this passkey"}?`,
										description:
											"You won't be able to sign in with it anymore.",
										confirmLabel: "Remove",
									},
								},
							},
						]}
					>
						<KeyRoundIcon class="text-muted-foreground size-4 shrink-0" />
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">
								{entry.name ?? "Passkey"}
							</p>
							<p class="text-muted-foreground text-xs">
								{entry.deviceType === "multiDevice"
									? "Synced"
									: "This device only"}{entry.createdAt
									? `, added ${new Date(entry.createdAt).toLocaleDateString()}`
									: ""}
							</p>
						</div>
					</ItemMenu>
				</li>
			{/each}
		</ul>
	{/if}

	<Button
		class="mt-5 h-11 rounded-xl px-5"
		onclick={handleAddPasskey}
		disabled={adding}><PlusIcon />Add a passkey</Button
	>
</section>
