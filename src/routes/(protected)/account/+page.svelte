<script lang="ts">
	import { enhance } from "$app/forms";
	import LogOutIcon from "@lucide/svelte/icons/log-out";

	import NavCards from "#lib/components/nav-cards.svelte";
	import { Button } from "#lib/components/ui/button/index.js";

	import { accountTabs } from "./tabs.js";

	const { data } = $props();
</script>

<div class="flex flex-col gap-6">
	<section
		class="glass flex items-center gap-4 rounded-2xl p-4 md:p-5"
		aria-label="Signed in as"
	>
		<span
			class="from-primary font-display flex size-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br to-[oklch(0.62_0.14_calc(var(--hue)+70))] text-xl font-semibold text-white"
			aria-hidden="true"
		>
			{data.user.name.slice(0, 1).toUpperCase()}
		</span>
		<span class="min-w-0">
			<span class="block truncate text-lg font-semibold">{data.user.name}</span>
			<span class="text-muted-foreground block truncate text-sm"
				>{data.user.email}</span
			>
		</span>
	</section>

	<NavCards tabs={accountTabs()} />

	<form method="POST" action="?/signOut" use:enhance>
		<Button
			type="submit"
			variant="destructive"
			size="lg"
			class="h-12 w-full rounded-xl text-base md:w-auto md:px-6"
		>
			<LogOutIcon />
			Sign out
		</Button>
	</form>
</div>
