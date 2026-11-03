<script lang="ts">
	import { enhance } from "$app/forms";
	import QrCodeIcon from "@lucide/svelte/icons/qr-code";

	import { Button } from "#lib/components/ui/button/index.js";
	import { enhanceToast } from "#lib/toast.js";

	let pairing = $state<{ qrCode: string; url: string } | null>(null);
</script>

<section
	class="glass mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl p-4 md:p-6"
>
	<div class="flex items-start gap-3">
		<span
			class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
		>
			<QrCodeIcon class="size-5" />
		</span>
		<div>
			<h2 class="font-semibold">Pair the LocalAssistant app</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Open the Android or iPhone app, tap Scan a pairing code and point it at
				the code below, or type this server's address in it instead. The code
				works once, for two minutes.
			</p>
		</div>
	</div>
	{#if pairing}
		<a
			href={pairing.url}
			class="size-56 self-center rounded-xl bg-white p-2 [&_svg]:size-full"
			aria-label="Pairing code: scan it with the app, or tap it on the phone to sign in"
		>
			{@html pairing.qrCode}
		</a>
	{/if}
	<form
		method="POST"
		action="?/pair"
		class="self-center"
		use:enhance={enhanceToast({
			loading: "Making a pairing code",
			success: "Scan it with the app within two minutes.",
			onSuccess: (result) => {
				pairing = (result?.pairing as typeof pairing) ?? null;
			},
		})}
	>
		<Button type="submit" class="h-11 rounded-xl px-5"
			><QrCodeIcon />{pairing ? "New code" : "Show a pairing code"}</Button
		>
	</form>
</section>
