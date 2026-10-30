<script lang="ts">
	import { resolve } from "$app/paths";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import SendIcon from "@lucide/svelte/icons/send";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import { tick } from "svelte";
	import { toast } from "svelte-sonner";

	import type { AssistantTurn } from "#lib/assistant.js";
	import EmptyState from "#lib/components/empty-state.svelte";
	import IconButton from "#lib/components/icon-button.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import { askAssistant } from "#lib/remote/assistant.remote.js";
	import { toastError } from "#lib/toast.js";

	const { data } = $props();

	interface Line extends AssistantTurn {
		actions?: string[];
	}

	let lines = $state<Line[]>([]);
	let draft = $state("");
	let asking = $state(false);
	let list = $state<HTMLElement>();

	setPageTitle("Assistant");

	const suggestions = [
		"What's on right now?",
		"Close every blind downstairs",
		"Is anyone home?",
	];

	async function askCallback(question: string) {
		const previous = draft;
		lines.push({ role: "user", text: question });
		draft = "";
		asking = true;
		await tick();
		list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
		try {
			const answer = await askAssistant({
				turns: lines.slice(-40).map(({ role, text }) => ({ role, text })),
			});
			lines.push({
				role: "assistant",
				text: answer.text,
				actions: answer.actions,
			});
		} catch (failure) {
			lines.pop();
			draft = previous || question;
			throw failure;
		} finally {
			asking = false;
			await tick();
			list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
		}
	}

	function handleAsk(question = draft.trim()) {
		if (!question || asking) {
			return;
		}
		toast.promise(askCallback(question), {
			loading: "Thinking",
			success: "Answered.",
			error: (failure: unknown) => toastError(failure),
		});
	}
</script>

{#if !data.configured}
	<div class="glass mx-auto max-w-xl rounded-2xl">
		<EmptyState
			icon={SparklesIcon}
			title="The assistant is off"
			subtitle={data.isAdmin
				? "Add a Claude API key to turn it on: then everyone can ask about the house and have it drive devices."
				: "Ask an admin to turn it on in Admin, AI."}
		>
			{#if data.isAdmin}
				<Button
					class="h-11 rounded-xl px-5"
					href={resolve("/(protected)/admin/ai")}>Turn it on</Button
				>
			{/if}
		</EmptyState>
	</div>
{:else}
	<div
		class="flex h-[calc(100dvh-12rem)] flex-col gap-3 md:h-[calc(100dvh-10rem)]"
	>
		<div
			bind:this={list}
			class="flex flex-1 flex-col gap-3 overflow-y-auto"
			aria-live="polite"
		>
			{#if lines.length === 0}
				<div
					class="m-auto flex max-w-md flex-col items-center gap-4 text-center"
				>
					<SparklesIcon class="text-primary size-8" />
					<p class="text-muted-foreground text-sm">
						Ask about the house or tell it what to do. It sees the devices an
						admin lets AI see, and acts as you.
					</p>
					<div class="flex flex-wrap justify-center gap-2">
						{#each suggestions as suggestion (suggestion)}
							<Button
								variant="secondary"
								class="h-11 rounded-full px-4"
								onclick={() => handleAsk(suggestion)}>{suggestion}</Button
							>
						{/each}
					</div>
				</div>
			{/if}
			{#each lines as line, index (index)}
				<div
					class={line.role === "user"
						? "bg-primary text-primary-foreground max-w-[85%] self-end rounded-2xl rounded-br-md px-4 py-2"
						: "glass max-w-[85%] self-start rounded-2xl rounded-bl-md px-4 py-2"}
				>
					<p class="text-sm whitespace-pre-wrap">{line.text}</p>
					{#if line.actions && line.actions.length > 0}
						<ul class="text-muted-foreground mt-1 text-xs">
							{#each line.actions as action (action)}
								<li>{action}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
			{#if asking}
				<div class="glass self-start rounded-2xl px-4 py-3">
					<Spinner />
				</div>
			{/if}
		</div>
		<form
			class="glass flex items-end gap-2 rounded-2xl p-2"
			onsubmit={(event) => {
				event.preventDefault();
				handleAsk();
			}}
		>
			{#if lines.length > 0}
				<IconButton
					type="button"
					label="Start over"
					icon={RotateCcwIcon}
					disabled={asking}
					onclick={() => (lines = [])}
				/>
			{/if}
			<Textarea
				bind:value={draft}
				aria-label="Message"
				placeholder="Turn the living room lamp on"
				rows={1}
				maxlength={4000}
				class="max-h-40 min-h-11 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
				onkeydown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						handleAsk();
					}
				}}
			/>
			<IconButton
				type="submit"
				variant="default"
				label="Send"
				icon={SendIcon}
				disabled={asking || !draft.trim()}
				class="rounded-xl"
			/>
		</form>
	</div>
{/if}
