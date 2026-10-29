<script lang="ts">
	import PlayIcon from "@lucide/svelte/icons/play";
	import { toast } from "svelte-sonner";

	import { Button } from "#lib/components/ui/button/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { activateScene } from "#lib/remote/scenes.remote.js";
	import { toastError } from "#lib/toast.js";

	interface Props {
		scene: { id: string; name: string };
		label?: string;
		class?: string;
	}

	const { scene, label = "Set", class: className }: Props = $props();

	let setting = $state(false);

	async function setSceneCallback() {
		setting = true;
		try {
			await activateScene({ sceneId: scene.id });
		} finally {
			setting = false;
		}
	}

	function handleSetScene() {
		toast.promise(setSceneCallback(), {
			loading: `Setting ${scene.name}`,
			success: `${scene.name} set.`,
			error: (error: unknown) => toastError(error),
		});
	}
</script>

<Button
	class={["h-11 rounded-xl px-4", className]}
	disabled={setting}
	onclick={handleSetScene}
	>{#if setting}<Spinner />{:else}<PlayIcon />{/if}{label}</Button
>
