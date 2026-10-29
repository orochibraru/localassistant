import { resolve } from "$app/paths";
import HistoryIcon from "@lucide/svelte/icons/history";
import SparklesIcon from "@lucide/svelte/icons/sparkles";
import WorkflowIcon from "@lucide/svelte/icons/workflow";

import type { SectionTab } from "#lib/components/nav-cards.svelte";

/** The routines section's pages, shared by its landing cards and its tabs. */
export function routineTabs(): SectionTab[] {
	return [
		{
			href: resolve("/(protected)/automations/routines"),
			label: "Routines",
			description:
				"What the house does on its own: at a time, at sunset, or when a device changes.",
			icon: WorkflowIcon,
		},
		{
			href: resolve("/(protected)/automations/scenes"),
			label: "Scenes",
			description:
				"Several devices set at once with one tap: movie night, bedtime, away.",
			icon: SparklesIcon,
		},
		{
			href: resolve("/(protected)/automations/history"),
			label: "History",
			description: "Every time a routine ran, was skipped or failed, and why.",
			icon: HistoryIcon,
		},
	];
}
