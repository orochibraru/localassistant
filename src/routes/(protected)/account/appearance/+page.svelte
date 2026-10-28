<script lang="ts">
	import { enhance } from "$app/forms";
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
	import CodeIcon from "@lucide/svelte/icons/code";
	import MonitorSmartphoneIcon from "@lucide/svelte/icons/monitor-smartphone";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import MoonStarIcon from "@lucide/svelte/icons/moon-star";
	import SmartphoneIcon from "@lucide/svelte/icons/smartphone";
	import SquareIcon from "@lucide/svelte/icons/square";
	import SquircleIcon from "@lucide/svelte/icons/squircle";
	import SunIcon from "@lucide/svelte/icons/sun";
	import TypeIcon from "@lucide/svelte/icons/type";
	import { untrack } from "svelte";

	import { applyAppearance } from "#lib/appearance.js";
	import OptionGroup from "#lib/components/account/option-group.svelte";
	import { enhanceToast } from "#lib/toast.js";

	const { data } = $props();

	const accents = [
		{ value: "bordeaux", label: "Bordeaux", hue: "oklch(0.44 0.15 8)" },
		{ value: "green", label: "Green", hue: "oklch(0.6 0.14 165)" },
		{ value: "blue", label: "Blue", hue: "oklch(0.6 0.19 255)" },
		{ value: "violet", label: "Violet", hue: "oklch(0.6 0.2 293)" },
		{ value: "rose", label: "Rose", hue: "oklch(0.6 0.2 12)" },
		{ value: "orange", label: "Orange", hue: "oklch(0.66 0.18 48)" },
		{ value: "amber", label: "Amber", hue: "oklch(0.76 0.16 78)" },
		{ value: "cyan", label: "Cyan", hue: "oklch(0.65 0.13 210)" },
		{ value: "neutral", label: "Neutral", hue: "oklch(0.3 0 0)" },
	] as const;

	const themes = [
		{
			value: "system",
			label: "System",
			description: "Follows your device: light or dark as it switches.",
			icon: MonitorSmartphoneIcon,
		},
		{
			value: "light",
			label: "Light",
			description: "Always light, whatever the device says.",
			icon: SunIcon,
		},
		{
			value: "dark",
			label: "Dark",
			description: "Always dark, easier on the eyes at night.",
			icon: MoonIcon,
		},
	] as const;

	const darkVariants = [
		{
			value: "default",
			label: "Dim",
			description: "A soft dark grey for dark mode.",
			icon: MoonStarIcon,
		},
		{
			value: "amoled",
			label: "AMOLED black",
			description: "Pure black: saves battery on OLED screens.",
			icon: CircleDotIcon,
		},
	] as const;

	const fonts = [
		{
			value: "default",
			label: "Geist and Sora",
			description: "LocalAssistant's own: Geist for text, Sora for titles.",
			icon: TypeIcon,
		},
		{
			value: "system",
			label: "System",
			description: "Your device's font, like San Francisco or Roboto.",
			icon: SmartphoneIcon,
		},
		{
			value: "serif",
			label: "Serif",
			description: "A classic book face for a calmer read.",
			icon: BookOpenIcon,
		},
		{
			value: "mono",
			label: "Mono",
			description: "Every character the same width, digits line up.",
			icon: CodeIcon,
		},
	] as const;

	const cornerStyles = [
		{
			value: "rounded",
			label: "Rounded",
			description: "Soft corners on cards, buttons and sheets.",
			icon: SquircleIcon,
		},
		{
			value: "square",
			label: "Square",
			description: "Sharp corners everywhere.",
			icon: SquareIcon,
		},
	] as const;

	let form: HTMLFormElement | undefined = $state();
	let current = $state(untrack(() => ({ ...data.appearance })));

	function preview() {
		applyAppearance(
			document.documentElement,
			current,
			matchMedia("(prefers-color-scheme: dark)").matches,
		);
		form?.requestSubmit();
	}
</script>

<form
	method="POST"
	bind:this={form}
	class="flex flex-col gap-7"
	use:enhance={enhanceToast({
		loading: "Saving appearance",
		success: "Appearance saved.",
		reset: false,
	})}
>
	<OptionGroup
		name="accent"
		legend="Accent"
		options={accents}
		bind:value={current.accent}
		onchange={preview}
	>
		{#snippet swatch(option)}
			<span
				class="size-5 rounded-full"
				style="background: {accents.find(
					(accent) => accent.value === option.value,
				)?.hue}"
				aria-hidden="true"
			></span>
		{/snippet}
	</OptionGroup>
	<OptionGroup
		name="theme"
		legend="Theme"
		options={themes}
		bind:value={current.theme}
		onchange={preview}
	/>
	<OptionGroup
		name="darkVariant"
		legend="Dark mode"
		options={darkVariants}
		bind:value={current.darkVariant}
		onchange={preview}
	/>
	<OptionGroup
		name="font"
		legend="Font"
		options={fonts}
		bind:value={current.font}
		onchange={preview}
	/>
	<OptionGroup
		name="corners"
		legend="Corners"
		options={cornerStyles}
		bind:value={current.corners}
		onchange={preview}
	/>
</form>
