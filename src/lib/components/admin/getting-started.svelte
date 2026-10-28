<script lang="ts">
	import { resolve } from "$app/paths";
	import CircleIcon from "@lucide/svelte/icons/circle";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import RocketIcon from "@lucide/svelte/icons/rocket";

	interface Props {
		emailConfigured: boolean;
		accountSecured: boolean;
		someoneInvited: boolean;
	}

	const { emailConfigured, accountSecured, someoneInvited }: Props = $props();

	const steps = $derived([
		{
			done: accountSecured,
			label: "Secure your admin account",
			hint: "Add a passkey or an authenticator app.",
			href: resolve("/(protected)/account/security"),
		},
		{
			done: emailConfigured,
			label: "Set up email",
			hint: "So invites and sign-in emails arrive by themselves.",
			href: resolve("/(protected)/admin/email"),
		},
		{
			done: someoneInvited,
			label: "Invite someone",
			hint: "So the rest of the house gets the controls too.",
			href: resolve("/(protected)/admin/invites"),
		},
	]);
	const remaining = $derived(steps.filter((step) => !step.done).length);
</script>

{#if remaining > 0}
	<section class="glass rounded-2xl p-4 md:p-6">
		<div class="flex items-center gap-3">
			<div
				class="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-xl"
			>
				<RocketIcon class="size-5" />
			</div>
			<div>
				<h2 class="font-semibold">Getting started</h2>
				<p class="text-muted-foreground text-sm">
					{remaining} of {steps.length} left to finish setting up this server.
				</p>
			</div>
		</div>
		<ul class="mt-4 grid gap-2 md:grid-cols-3">
			{#each steps as step (step.href)}
				<li>
					<a
						href={step.href}
						class="hover:border-primary/40 active:bg-muted flex h-full items-start gap-3 rounded-xl border p-3 transition-colors {step.done
							? 'opacity-60'
							: ''}"
					>
						{#if step.done}
							<CircleCheckIcon class="text-positive mt-0.5 size-5 shrink-0" />
						{:else}
							<CircleIcon
								class="text-muted-foreground mt-0.5 size-5 shrink-0"
							/>
						{/if}
						<span>
							<span
								class="block text-sm font-medium {step.done
									? 'line-through'
									: ''}">{step.label}</span
							>
							<span class="text-muted-foreground block text-xs"
								>{step.hint}</span
							>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
