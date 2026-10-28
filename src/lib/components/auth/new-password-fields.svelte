<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import XIcon from "@lucide/svelte/icons/x";

	import IconButton from "#lib/components/icon-button.svelte";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import {
		passwordMaxLength,
		passwordRules,
		passwordScore,
	} from "#lib/password-policy.js";

	interface Props {
		email: string;
		errors: Record<string, string[]>;
	}

	const { email, errors }: Props = $props();

	let password = $state("");
	let confirmPassword = $state("");
	let visible = $state(false);

	const rules = $derived(
		passwordRules(password, email).filter((rule) => rule.id !== "max"),
	);
	const score = $derived(passwordScore(password, email));
	const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
	const strengthColors = [
		"bg-muted",
		"bg-destructive",
		"bg-orange-500",
		"bg-primary/70",
		"bg-primary",
	];
	const mismatch = $derived(
		confirmPassword.length > 0 && confirmPassword !== password,
	);
</script>

<Field.Field>
	<Field.Label for="new-password">Password</Field.Label>
	<div class="relative">
		<Input
			id="new-password"
			name="password"
			type={visible ? "text" : "password"}
			autocomplete="new-password"
			maxlength={passwordMaxLength}
			required
			bind:value={password}
			class="h-11 pr-12"
		/>
		<div class="absolute inset-y-0 right-0 flex items-center">
			<IconButton
				label={visible ? "Hide password" : "Show password"}
				icon={visible ? EyeOffIcon : EyeIcon}
				onclick={() => (visible = !visible)}
				class="size-11"
			/>
		</div>
	</div>
	<div class="mt-1 flex items-center gap-2" aria-live="polite">
		<div class="flex flex-1 gap-1">
			{#each [1, 2, 3, 4] as step (step)}
				<span
					class="h-1.5 flex-1 rounded-full transition-colors {score >= step
						? strengthColors[score]
						: 'bg-muted'}"
				></span>
			{/each}
		</div>
		<span class="text-muted-foreground w-12 text-right text-xs"
			>{strengthLabels[score]}</span
		>
	</div>
	<ul class="mt-1 flex flex-col gap-1 text-sm">
		{#each rules as rule (rule.id)}
			<li
				class="flex items-center gap-2 {rule.passed
					? 'text-positive'
					: 'text-muted-foreground'}"
			>
				{#if rule.passed}<CheckIcon class="size-4" />{:else}<XIcon
						class="size-4"
					/>{/if}
				{rule.label}
			</li>
		{/each}
	</ul>
	<Field.Error errors={errors.password?.map((message) => ({ message }))} />
</Field.Field>
<Field.Field>
	<Field.Label for="confirm-password">Type it again</Field.Label>
	<Input
		id="confirm-password"
		name="confirmPassword"
		type={visible ? "text" : "password"}
		autocomplete="new-password"
		maxlength={passwordMaxLength}
		required
		bind:value={confirmPassword}
		aria-invalid={mismatch}
		class="h-11"
	/>
	{#if mismatch}
		<p class="text-destructive text-sm">The passwords don't match.</p>
	{/if}
	<Field.Error
		errors={errors.confirmPassword?.map((message) => ({ message }))}
	/>
</Field.Field>
