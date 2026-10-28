<script lang="ts">
	import { cn } from "#lib/utils.js";

	const { version, class: className }: { version: string; class?: string } =
		$props();

	const year = new Date().getFullYear();
</script>

<footer
	class={cn(
		"text-muted-foreground flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs",
		className,
	)}
>
	<span>LocalAssistant <span class="tabular">v{version}</span></span>
	<span aria-hidden="true">·</span>
	<span>© {year} Orochibraru</span>
	<span aria-hidden="true">·</span>
	<a
		href="https://github.com/orochibraru/localassistant/blob/main/LICENSE"
		target="_blank"
		rel="noopener noreferrer"
		class="hover:text-foreground underline-offset-4 hover:underline"
		>MIT License</a
	>
	<span aria-hidden="true">·</span>
	<a
		href="https://github.com/orochibraru/localassistant"
		target="_blank"
		rel="noopener noreferrer"
		class="hover:text-foreground underline-offset-4 hover:underline"
		>Source code</a
	>
</footer>
