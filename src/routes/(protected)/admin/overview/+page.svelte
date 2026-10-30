<script lang="ts">
	import { resolve } from "$app/paths";
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import CircleArrowUpIcon from "@lucide/svelte/icons/circle-arrow-up";
	import DoorOpenIcon from "@lucide/svelte/icons/door-open";
	import HardDriveIcon from "@lucide/svelte/icons/hard-drive";
	import MailIcon from "@lucide/svelte/icons/mail";
	import MailPlusIcon from "@lucide/svelte/icons/mail-plus";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import ServerIcon from "@lucide/svelte/icons/server";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import UsersIcon from "@lucide/svelte/icons/users";

	import GettingStarted from "#lib/components/admin/getting-started.svelte";
	import StatCard from "#lib/components/stat-card.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { formatBytes, formatDuration } from "#lib/format.js";

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
	{#if data.health.update}
		<section
			class="glass flex flex-wrap items-center gap-3 rounded-2xl p-4 md:p-5"
			aria-label="Update available"
		>
			<CircleArrowUpIcon class="text-primary size-6 shrink-0" />
			<p class="min-w-0 flex-1 text-sm">
				<span class="font-medium"
					>LocalAssistant {data.health.update.version} is out.</span
				>
				This server runs {data.health.version}: pull the new image and restart
				the container.
			</p>
			<Button
				variant="outline"
				class="h-11 rounded-xl px-4"
				href={data.health.update.url}
				target="_blank"
				rel="noreferrer">What's new</Button
			>
		</section>
	{/if}
	<GettingStarted {...data.gettingStarted} />
	<div
		class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] md:gap-4"
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
			<ServerIcon class="text-muted-foreground size-4" />
			Server
		</h2>
		<div
			class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] md:gap-4"
		>
			<StatCard
				label="Version"
				value={data.health.version}
				hint={`Up ${formatDuration(data.health.uptimeSeconds)}`}
				tone={data.health.update ? "warning" : "default"}
				icon={ServerIcon}
			/>
			<StatCard
				label="Database"
				value={data.health.databaseBytes === null
					? "In memory"
					: formatBytes(data.health.databaseBytes)}
				hint={data.health.diskFreeBytes === null
					? undefined
					: `${formatBytes(data.health.diskFreeBytes)} free on its disk`}
				tone={data.health.diskFreeBytes !== null &&
				data.health.diskFreeBytes < 1024 ** 3
					? "warning"
					: "default"}
				icon={HardDriveIcon}
			/>
			<StatCard
				label="Integrations"
				value={data.health.brokenPlugins.length === 0
					? "All loaded"
					: `${data.health.brokenPlugins.length} failed to load`}
				hint={data.health.brokenPlugins
					.map((plugin) => plugin.name)
					.join(", ") || undefined}
				tone={data.health.brokenPlugins.length === 0 ? "positive" : "warning"}
				icon={PuzzleIcon}
				href={resolve("/(protected)/admin/plugins")}
			/>
		</div>
	</section>

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
