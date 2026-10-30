<script lang="ts">
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import SmartphoneIcon from "@lucide/svelte/icons/smartphone";
	import XIcon from "@lucide/svelte/icons/x";

	import { Button } from "#lib/components/ui/button/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";

	const { data } = $props();

	setPageTitle("Sign in the app");
</script>

<form
	method="POST"
	action="?/approve"
	class="glass mx-auto flex max-w-md flex-col gap-4 rounded-3xl p-5 md:mt-8 md:p-6"
>
	{#each Object.entries(data.request) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	<span
		class="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-2xl"
	>
		<SmartphoneIcon class="size-6" />
	</span>
	<div>
		<h2 class="text-xl font-semibold">
			Sign in LocalAssistant on {data.request.device || "this phone"}?
		</h2>
		<p class="text-muted-foreground mt-1 text-sm">
			The app signs in as you and sees and drives the house like this browser.
			Only say yes if you just opened it yourself. Sign it out any time under
			Account, Security.
		</p>
	</div>
	<div class="flex flex-col gap-2 sm:flex-row">
		<Button
			href={resolve("/(protected)")}
			variant="secondary"
			class="h-11 rounded-xl sm:flex-1"><XIcon />Cancel</Button
		>
		<Button type="submit" class="glow h-11 rounded-xl sm:flex-1"
			><CheckIcon />Sign in</Button
		>
	</div>
</form>
