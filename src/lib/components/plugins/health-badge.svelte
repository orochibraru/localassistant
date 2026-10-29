<script lang="ts">
	import { Badge } from "#lib/components/ui/badge/index.js";
	import {
		type PluginHealth,
		pluginHealthDescriptions,
		pluginHealthLabels,
	} from "#lib/plugins.js";

	interface Props {
		health: PluginHealth;
	}

	const { health }: Props = $props();

	const variants: Record<
		PluginHealth,
		"default" | "secondary" | "outline" | "destructive"
	> = {
		official: "default",
		local: "outline",
		maintained: "secondary",
		quiet: "outline",
		unmaintained: "destructive",
		archived: "destructive",
		unknown: "outline",
	};
</script>

<Badge variant={variants[health]} title={pluginHealthDescriptions[health]}
	>{pluginHealthLabels[health]}</Badge
>
