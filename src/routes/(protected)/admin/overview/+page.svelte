<script lang="ts">
	import { resolve } from "$app/paths";
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import MailIcon from "@lucide/svelte/icons/mail";
	import MailPlusIcon from "@lucide/svelte/icons/mail-plus";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import UsersIcon from "@lucide/svelte/icons/users";

	import GettingStarted from "#lib/components/admin/getting-started.svelte";
	import StatCard from "#lib/components/stat-card.svelte";

	const { data } = $props();

	const requirement = $derived(
		[
			data.requireTwoFactor && "authenticator app",
			data.requirePasskey && "passkey",
		]
			.filter(Boolean)
			.join(" + ") || "Password only",
	);
</script>

<div class="flex flex-col gap-8">
	<GettingStarted {...data.gettingStarted} />
	<div
		class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] md:gap-4"
	>
		<StatCard
			label="Users"
			value={data.users}
			icon={UsersIcon}
			href={resolve("/(protected)/admin/users")}
		/>
		<StatCard
			label="Pending invites"
			value={data.pendingInvites}
			icon={MailPlusIcon}
			href={resolve("/(protected)/admin/invites")}
		/>
		<StatCard
			label="Sign-in requires"
			value={requirement}
			icon={ShieldCheckIcon}
			href={resolve("/(protected)/admin/access")}
		/>
		<StatCard
			label="Email"
			value={data.emailConfigured ? "Configured" : "Not set up"}
			tone={data.emailConfigured ? "positive" : "warning"}
			hint={data.emailConfigured ? undefined : "Invites only work by link"}
			icon={MailIcon}
			href={resolve("/(protected)/admin/email")}
		/>
		<StatCard
			label="Devices"
			value={String(data.devices)}
			icon={PlugIcon}
			href={resolve("/(protected)/devices")}
		/>
	</div>

	<section>
		<h2 class="mb-3 flex items-center gap-2 font-semibold">
			<ActivityIcon class="text-muted-foreground size-4" />
			Background jobs
		</h2>
		<dl class="glass grid grid-cols-4 divide-x rounded-2xl text-center">
			{#each Object.entries(data.jobs) as [status, total] (status)}
				<div class="px-2 py-3">
					<dt class="text-muted-foreground text-xs capitalize">{status}</dt>
					<dd
						class="text-lg font-semibold tabular {status === 'failed' &&
						total > 0
							? 'text-destructive'
							: ''}"
					>
						{total}
					</dd>
				</div>
			{/each}
		</dl>
		{#if data.failures.length > 0}
			<ul class="glass divide-border mt-3 divide-y rounded-2xl">
				{#each data.failures as failure (failure.id)}
					<li class="px-4 py-3 text-sm">
						<p class="font-medium">{failure.type}</p>
						<p
							class="text-muted-foreground mt-0.5 line-clamp-2 font-mono text-xs break-all"
						>
							{failure.lastError}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
