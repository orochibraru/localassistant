<script lang="ts">
	import { resolve } from "$app/paths";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import WrenchIcon from "@lucide/svelte/icons/wrench";

	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import type { IntegrationProblem } from "#lib/plugins.js";
	import { useSheets } from "#lib/sheets.svelte.js";

	interface Props {
		problems: IntegrationProblem[];
	}

	const { problems }: Props = $props();

	const sheets = useSheets();
</script>

{#if problems.length > 0}
	<div class="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
		{#each problems as problem (problem.pluginId)}
			<Alert.Root variant="destructive" class="glass rounded-2xl">
				<TriangleAlertIcon />
				<Alert.Title>{problem.name} is broken</Alert.Title>
				<Alert.Description class="flex flex-col items-start gap-3">
					<p class="line-clamp-3 wrap-break-word">{problem.message}</p>
					{#if problem.fix === "setup"}
						<Button
							variant="outline"
							class="h-11 rounded-xl px-5"
							onclick={() => (sheets.addDevice = problem.pluginId)}
							><WrenchIcon />Fix {problem.name}</Button
						>
					{:else}
						<Button
							variant="outline"
							class="h-11 rounded-xl px-5"
							href={resolve("/(protected)/integrations")}
							><WrenchIcon />Fix {problem.name}</Button
						>
					{/if}
				</Alert.Description>
			</Alert.Root>
		{/each}
	</div>
{/if}
