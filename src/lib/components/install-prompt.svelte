<script lang="ts">
	import DownloadIcon from "@lucide/svelte/icons/download";
	import EllipsisVerticalIcon from "@lucide/svelte/icons/ellipsis-vertical";
	import ShareIcon from "@lucide/svelte/icons/share";
	import SquarePlusIcon from "@lucide/svelte/icons/square-plus";
	import { onMount } from "svelte";

	import BrandMark from "#lib/components/brand-mark.svelte";
	import ResponsiveSheet from "#lib/components/responsive-sheet.svelte";
	import { Button } from "#lib/components/ui/button/index.js";

	interface InstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
	}

	const storageKey = "localassistant-install-prompted";

	let open = $state(false);
	let mode = $state<"native" | "apple" | "menu">("native");
	let deferred: InstallPromptEvent | undefined;

	function alreadyPrompted(): boolean {
		try {
			return localStorage.getItem(storageKey) !== null;
		} catch {
			return true;
		}
	}

	function show(next: "native" | "apple" | "menu") {
		if (alreadyPrompted()) {
			return;
		}
		mode = next;
		open = true;
		try {
			localStorage.setItem(storageKey, new Date().toISOString());
		} catch {
			open = false;
		}
	}

	onMount(() => {
		const standalone =
			matchMedia("(display-mode: standalone)").matches ||
			("standalone" in navigator && navigator.standalone === true);
		const touch = matchMedia("(pointer: coarse)").matches;
		if (standalone || !touch || alreadyPrompted()) {
			return;
		}
		const apple =
			/iPhone|iPad/.test(navigator.userAgent) ||
			(/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
		if (apple) {
			const timer = setTimeout(() => show("apple"), 1500);
			return () => clearTimeout(timer);
		}
		const capture = (event: Event) => {
			event.preventDefault();
			deferred = event as InstallPromptEvent;
			if (open) {
				mode = "native";
			} else {
				show("native");
			}
		};
		addEventListener("beforeinstallprompt", capture);
		const fallback = setTimeout(() => {
			if (!deferred) {
				show("menu");
			}
		}, 4000);
		return () => {
			removeEventListener("beforeinstallprompt", capture);
			clearTimeout(fallback);
		};
	});

	async function install() {
		open = false;
		await deferred?.prompt();
		deferred = undefined;
	}
</script>

<ResponsiveSheet
	bind:open
	title="Install LocalAssistant"
	description="Open it from your home screen like any app: full screen, quicker to reach, and with notifications."
>
	<div class="flex flex-col gap-5 pb-4">
		<div class="flex justify-center py-2">
			<BrandMark class="size-16 drop-shadow-lg" />
		</div>
		{#if mode === "apple"}
			<ol class="flex flex-col gap-3 text-sm">
				<li class="flex items-center gap-3">
					<span
						class="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-xl"
						><ShareIcon class="size-4" /></span
					>
					Tap Share in your browser's toolbar or address bar.
				</li>
				<li class="flex items-center gap-3">
					<span
						class="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-xl"
						><SquarePlusIcon class="size-4" /></span
					>
					Pick Add to Home Screen, then Add.
				</li>
			</ol>
			<Button class="h-12 rounded-xl text-base" onclick={() => (open = false)}
				>Got it</Button
			>
		{:else if mode === "menu"}
			<ol class="flex flex-col gap-3 text-sm">
				<li class="flex items-center gap-3">
					<span
						class="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-xl"
						><EllipsisVerticalIcon class="size-4" /></span
					>
					Open your browser's menu.
				</li>
				<li class="flex items-center gap-3">
					<span
						class="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-xl"
						><SquarePlusIcon class="size-4" /></span
					>
					Pick Install app or Add to Home screen.
				</li>
			</ol>
			<Button class="h-12 rounded-xl text-base" onclick={() => (open = false)}
				>Got it</Button
			>
		{:else}
			<Button class="glow h-12 rounded-xl text-base" onclick={install}>
				<DownloadIcon />
				Install
			</Button>
			<Button
				variant="ghost"
				class="h-11 rounded-xl"
				onclick={() => (open = false)}>Not now</Button
			>
		{/if}
	</div>
</ResponsiveSheet>
