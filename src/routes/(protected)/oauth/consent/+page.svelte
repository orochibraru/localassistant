<script lang="ts">
	import { enhance } from "$app/forms";
	import BotIcon from "@lucide/svelte/icons/bot";
	import CheckIcon from "@lucide/svelte/icons/check";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import XIcon from "@lucide/svelte/icons/x";

	import { Button } from "#lib/components/ui/button/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();

	setPageTitle("Connect an AI app");

	const host = $derived(data.app.uri ? new URL(data.app.uri).host : null);
</script>

<form
	method="POST"
	action="?/decide"
	class="grid gap-4 lg:grid-cols-3"
	use:enhance={enhanceToast({
		loading: "Sending your answer",
		success: "Done. Head back to your AI app.",
	})}
>
	<input type="hidden" name="query" value={data.query} />
	<section class="glass flex flex-col gap-4 rounded-3xl p-5 md:p-6">
		<span
			class="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-2xl"
		>
			<BotIcon class="size-6" />
		</span>
		<div>
			<h2 class="text-xl font-semibold">{data.app.name}</h2>
			{#if host}
				<p class="text-muted-foreground text-sm">{host}</p>
			{/if}
		</div>
		<p class="text-muted-foreground text-sm">
			wants to see your house and drive its devices. Only say yes to an app you
			just connected yourself. It loses access after {data.days}
			days, then asks you to sign in again; revoke it sooner under Account, AI apps.
		</p>
		<div class="mt-auto flex flex-col gap-2 sm:flex-row">
			<Button
				type="submit"
				name="accept"
				value="false"
				variant="secondary"
				class="h-11 rounded-xl sm:flex-1"
			>
				<XIcon />
				Deny
			</Button>
			<Button
				type="submit"
				name="accept"
				value="true"
				class="glow h-11 rounded-xl sm:flex-1"
			>
				<CheckIcon />
				Allow
			</Button>
		</div>
	</section>
	<section class="glass flex flex-col gap-3 rounded-3xl p-5 md:p-6">
		<h2 class="flex items-center gap-2 font-semibold">
			<EyeIcon class="size-4" />
			It can see
		</h2>
		<ul
			class="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-sm"
		>
			<li>Your floors, rooms and outside spaces</li>
			<li>Every device, its room, last reading and whether it answers</li>
		</ul>
		<h2 class="mt-2 flex items-center gap-2 font-semibold">
			<PencilIcon class="size-4" />
			It can change
		</h2>
		<ul
			class="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-sm"
		>
			<li>Open, close, stop and move the blinds</li>
			<li>
				Turn the heat pumps on or off, set their mode and temperature, boost the
				hot water
			</li>
			<li>Pause, resume or stop a print, the printer's light and speed</li>
		</ul>
	</section>
	<section class="glass flex flex-col gap-3 rounded-3xl p-5 md:p-6">
		<h2 class="flex items-center gap-2 font-semibold">
			<EyeOffIcon class="size-4" />
			It never sees
		</h2>
		<ul
			class="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-sm"
		>
			<li>Your email, password, or any sign-in detail</li>
			<li>The device keys, access codes and the MELCloud password</li>
			<li>Adding, changing or removing devices, rooms and floors</li>
		</ul>
	</section>
</form>
