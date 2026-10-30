<script lang="ts">
	import { resolve } from "$app/paths";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import CheckIcon from "@lucide/svelte/icons/check";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import SquarePenIcon from "@lucide/svelte/icons/square-pen";
	import { onMount, tick } from "svelte";

	import type { AssistantTurn } from "#lib/assistant.js";
	import IconButton from "#lib/components/icon-button.svelte";
	import Markdown from "#lib/components/markdown.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { askAssistant } from "#lib/remote/assistant.remote.js";
	import { toastError } from "#lib/toast.js";

	const { data } = $props();

	interface Line extends AssistantTurn {
		actions?: string[];
	}

	const storageKey = "localassistant-assistant-chat";
	const suggestions = [
		"What's on right now?",
		"Close every blind downstairs",
		"Is anyone home?",
		"Turn everything off in the living room",
	];

	let lines = $state<Line[]>([]);
	let draft = $state("");
	let asking = $state(false);
	let failure = $state<string | null>(null);
	let list = $state<HTMLElement>();
	let composer = $state<HTMLTextAreaElement>();

	onMount(() => {
		try {
			const saved: unknown = JSON.parse(
				sessionStorage.getItem(storageKey) ?? "[]",
			);
			if (Array.isArray(saved)) {
				lines = saved as Line[];
			}
		} catch {
			lines = [];
		}
		void scrollDown("instant");
	});

	$effect(() => {
		const snapshot = JSON.stringify(lines);
		try {
			sessionStorage.setItem(storageKey, snapshot);
		} catch {
			return;
		}
	});

	async function scrollDown(behavior: ScrollBehavior = "smooth") {
		await tick();
		list?.scrollTo({ top: list.scrollHeight, behavior });
	}

	function grow() {
		if (composer) {
			composer.style.height = "auto";
			composer.style.height = `${Math.min(composer.scrollHeight, 160)}px`;
		}
	}

	async function ask() {
		asking = true;
		failure = null;
		void scrollDown();
		try {
			const answer = await askAssistant({
				turns: lines.slice(-40).map(({ role, text }) => ({ role, text })),
			});
			lines.push({
				role: "assistant",
				text: answer.text,
				actions: answer.actions,
			});
		} catch (error) {
			failure = toastError(error);
		} finally {
			asking = false;
			void scrollDown();
		}
	}

	function send(question = draft.trim()) {
		if (!question || asking) {
			return;
		}
		if (failure && lines.at(-1)?.role === "user") {
			lines.pop();
		}
		lines.push({ role: "user", text: question });
		draft = "";
		void tick().then(grow);
		void ask();
	}

	function startOver() {
		lines = [];
		failure = null;
		composer?.focus();
	}
</script>

<svelte:head>
	<title>Assistant | LocalAssistant</title>
</svelte:head>

<div class="flex h-full flex-col">
	<header
		class="bg-chrome flex shrink-0 items-center gap-2 border-b px-2 pt-safe-top backdrop-blur-2xl md:px-6"
	>
		<div class="flex h-14 w-full items-center gap-2 md:h-16">
			<IconButton
				label="Back to Home"
				icon={ArrowLeftIcon}
				href={resolve("/(protected)")}
				class="md:hidden"
			/>
			<SparklesIcon class="text-primary hidden size-5 md:block" />
			<h1 class="flex-1 truncate font-semibold">Assistant</h1>
			{#if lines.length > 0}
				<IconButton
					label="New conversation"
					icon={SquarePenIcon}
					disabled={asking}
					onclick={startOver}
				/>
			{/if}
		</div>
	</header>

	{#if !data.configured}
		<div class="flex flex-1 items-center justify-center p-6">
			<div class="flex max-w-sm flex-col items-center gap-4 text-center">
				<SparklesIcon class="text-primary size-10" />
				<h2 class="text-lg font-semibold">The assistant is off</h2>
				<p class="text-muted-foreground text-sm">
					{data.isAdmin
						? "Add a Claude API key to turn it on: then everyone can ask about the house and have it drive devices."
						: "Ask an admin to turn it on in Admin, AI."}
				</p>
				{#if data.isAdmin}
					<Button
						class="h-11 rounded-xl px-5"
						href={resolve("/(protected)/admin/ai")}>Turn it on</Button
					>
				{/if}
			</div>
		</div>
	{:else}
		<div
			bind:this={list}
			class="flex-1 overflow-y-auto overscroll-contain"
			aria-live="polite"
		>
			<div
				class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-3 px-4 py-4 md:px-6"
			>
				{#if lines.length === 0}
					<div
						class="my-auto flex flex-col items-center gap-5 py-10 text-center"
					>
						<span
							class="bg-primary/15 text-primary flex size-16 items-center justify-center rounded-3xl"
						>
							<SparklesIcon class="size-8" />
						</span>
						<div>
							<h2 class="text-lg font-semibold">
								Hi {data.user.name.split(" ")[0]}
							</h2>
							<p class="text-muted-foreground mt-1 max-w-sm text-sm">
								Ask about the house or tell it what to do. It sees the devices
								an admin lets AI see, and acts as you.
							</p>
						</div>
						<div class="grid w-full max-w-md gap-2 sm:grid-cols-2">
							{#each suggestions as suggestion (suggestion)}
								<button
									type="button"
									class="glass hover:bg-accent/40 min-h-11 rounded-2xl px-4 py-3 text-left text-sm transition-colors"
									onclick={() => send(suggestion)}>{suggestion}</button
								>
							{/each}
						</div>
					</div>
				{/if}
				{#each lines as line, index (index)}
					{#if line.role === "user"}
						<div
							class="bg-primary text-primary-foreground max-w-[85%] self-end rounded-3xl rounded-br-lg px-4 py-2.5"
						>
							<p class="text-[0.9375rem] whitespace-pre-wrap">{line.text}</p>
						</div>
					{:else}
						<div class="flex max-w-[92%] gap-2.5 self-start">
							<span
								class="bg-primary/15 text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
								aria-hidden="true"
							>
								<SparklesIcon class="size-4" />
							</span>
							<div
								class="bg-card flex min-w-0 flex-col gap-2 rounded-3xl rounded-tl-lg border px-4 py-2.5 text-[0.9375rem] leading-relaxed"
							>
								<Markdown text={line.text} />
								{#if line.actions && line.actions.length > 0}
									<ul class="flex flex-wrap gap-1.5">
										{#each line.actions as action (action)}
											<li
												class="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
											>
												<CheckIcon class="size-3" />{action}
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
				{#if asking}
					<div class="flex gap-2.5 self-start" aria-label="Thinking">
						<span
							class="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-full"
							aria-hidden="true"
						>
							<SparklesIcon class="size-4" />
						</span>
						<span class="flex items-center gap-1 py-2" aria-hidden="true">
							{#each [0, 150, 300] as delay (delay)}
								<span
									class="bg-muted-foreground size-1.5 animate-bounce rounded-full"
									style:animation-delay="{delay}ms"
								></span>
							{/each}
						</span>
					</div>
				{/if}
				{#if failure}
					<div
						class="border-destructive/40 bg-destructive/10 flex items-center gap-3 self-start rounded-2xl border px-4 py-2"
						role="alert"
					>
						<p class="text-destructive text-sm">{failure}</p>
						<Button
							variant="ghost"
							class="h-11 shrink-0 rounded-xl px-3"
							onclick={() => void ask()}><RotateCcwIcon />Retry</Button
						>
					</div>
				{/if}
			</div>
		</div>

		<form
			class="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:pb-6"
			onsubmit={(event) => {
				event.preventDefault();
				send();
			}}
		>
			<div
				class="glass mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl p-1.5 pl-4"
			>
				<textarea
					bind:this={composer}
					bind:value={draft}
					aria-label="Message"
					placeholder="Message the assistant"
					rows={1}
					maxlength={4000}
					enterkeyhint="send"
					class="placeholder:text-muted-foreground max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base outline-none"
					oninput={grow}
					onkeydown={(event) => {
						if (
							event.key === "Enter" &&
							!event.shiftKey &&
							!event.isComposing &&
							matchMedia("(pointer: fine)").matches
						) {
							event.preventDefault();
							send();
						}
					}}></textarea>
				<IconButton
					type="submit"
					variant="default"
					label="Send"
					icon={ArrowUpIcon}
					disabled={asking || !draft.trim()}
					class="size-11 rounded-full"
				/>
			</div>
		</form>
	{/if}
</div>
