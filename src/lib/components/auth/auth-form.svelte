<script lang="ts">
	import { enhance } from "$app/forms";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import type { Component, Snippet } from "svelte";

	import { Button } from "#lib/components/ui/button/index.js";
	import { enhanceToast } from "#lib/toast.js";

	interface Props {
		action?: string;
		submitLabel: string;
		submitIcon?: Component<{ class?: string }>;
		loading: string;
		success: string;
		errors: Record<string, string[]>;
		onSuccess?: () => void;
		children: Snippet;
	}

	let {
		action,
		submitLabel,
		submitIcon: SubmitIcon = ArrowRightIcon,
		loading,
		success,
		errors = $bindable(),
		onSuccess,
		children,
	}: Props = $props();

	let pending = $state(false);
</script>

<form
	method="POST"
	{action}
	class="flex flex-col gap-5"
	use:enhance={enhanceToast({
		loading,
		success,
		onStart: () => (pending = true),
		onSettled: () => (pending = false),
		onFailure: (data) =>
			(errors = (data?.errors as Record<string, string[]>) ?? {}),
		onSuccess: () => {
			errors = {};
			onSuccess?.();
		},
	})}
>
	{@render children()}
	<Button
		type="submit"
		size="lg"
		class="glow mt-2 h-12 rounded-xl text-base"
		disabled={pending}
	>
		<SubmitIcon />
		{submitLabel}
	</Button>
</form>
