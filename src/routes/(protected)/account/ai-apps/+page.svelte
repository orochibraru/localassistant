<script lang="ts">
	import BotIcon from "@lucide/svelte/icons/bot";
	import UnplugIcon from "@lucide/svelte/icons/unplug";

	import CopyField from "#lib/components/copy-field.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import ItemMenu from "#lib/components/item-menu.svelte";

	const { data } = $props();

	function day(date: Date): string {
		return date.toLocaleDateString(undefined, {
			day: "numeric",
			month: "short",
		});
	}
</script>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
	<section class="glass flex min-w-0 flex-col gap-4 rounded-2xl p-4 md:p-6">
		<div>
			<h2 class="font-semibold">Connect an AI app</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Claude, ChatGPT or Gemini can see your floors, rooms and devices with
				their last readings, drive them like you do on Home, and create and
				change routines and scenes. They can't add, change or remove devices or
				rooms, and never see your email, the device keys or any password.
			</p>
		</div>
		{#if data.mcpUrl}
			<CopyField value={data.mcpUrl} label="Copy the MCP server address" />
			<ol
				class="text-muted-foreground flex list-decimal flex-col gap-1.5 pl-5 text-sm"
			>
				<li>
					Add this address as a custom connector in Claude, an app in ChatGPT,
					or a connected app in Gemini.
				</li>
				<li>Sign in here when it asks, and allow it.</li>
				<li>
					Ask it to close the bedroom blinds, or warm the living room to 21°.
				</li>
			</ol>
		{:else}
			<p class="text-sm">
				AI apps only connect to a server on HTTPS. Put LocalAssistant behind
				HTTPS first.
			</p>
		{/if}
	</section>

	<section class="glass flex min-w-0 flex-col gap-3 rounded-2xl p-4 md:p-6">
		<div>
			<h2 class="font-semibold">Connected</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Each app asks you to sign in again 30 days after you allowed it.
			</p>
		</div>
		{#if data.apps.length === 0}
			<EmptyState
				icon={BotIcon}
				title="No AI app yet"
				subtitle="Apps you allow show up here, and you can cut them off any time."
			/>
		{:else}
			<ul class="divide-border -mx-1 divide-y" aria-label="Connected AI apps">
				{#each data.apps as app (app.clientId)}
					<li>
						<ItemMenu
							title={app.name}
							class="min-h-14 px-1 py-2"
							actions={[
								{
									label: "Revoke",
									icon: UnplugIcon,
									destructive: true,
									form: {
										action: "?/revoke",
										fields: { clientId: app.clientId },
										loading: "Revoking",
										success: `${app.name} is cut off.`,
										confirm: {
											title: `Revoke ${app.name}?`,
											description:
												"It stops working right away. Connect it again to use it.",
											confirmLabel: "Revoke",
										},
									},
								},
							]}
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{app.name}</span>
								<span class="text-muted-foreground block truncate text-sm"
									>Allowed {day(app.approvedAt)} · {app.expiresAt > new Date()
										? `until ${day(app.expiresAt)}`
										: "expired"}</span
								>
							</span>
						</ItemMenu>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
