<script lang="ts">
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";

	import { describeCommand } from "#lib/automations.js";
	import SceneSheet from "#lib/components/automations/scene-sheet.svelte";
	import EmptyState from "#lib/components/empty-state.svelte";
	import Fab from "#lib/components/fab.svelte";
	import ItemMenu from "#lib/components/item-menu.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { activateScene } from "#lib/remote/scenes.remote.js";
	import { toastError } from "#lib/toast.js";

	const { data } = $props();

	type Scene = (typeof data.scenes)[number];

	let sheetOpen = $state(false);
	let editing = $state<Scene | null>(null);
	let setting = $state<string | null>(null);

	const names = $derived(
		new Map(data.setup.map((device) => [device.id, device.name])),
	);

	function openSheet(scene: Scene | null) {
		editing = scene;
		sheetOpen = true;
	}

	async function setSceneCallback(scene: Scene) {
		setting = scene.id;
		try {
			await activateScene({ sceneId: scene.id });
		} finally {
			setting = null;
		}
	}

	function handleSetScene(scene: Scene) {
		toast.promise(setSceneCallback(scene), {
			loading: `Setting ${scene.name}`,
			success: `${scene.name} set.`,
			error: (error: unknown) => toastError(error),
		});
	}
</script>

{#if data.scenes.length > 0}
	<div class="mb-4 hidden justify-end md:flex">
		<Button class="h-11 rounded-xl px-5" onclick={() => openSheet(null)}
			><PlusIcon />New scene</Button
		>
	</div>
{/if}
{#if data.scenes.length === 0}
	<div class="glass rounded-2xl">
		<EmptyState
			icon={SparklesIcon}
			title="No scene yet"
			subtitle="Set the lights, blinds and heating for movie night or bedtime once, then bring them back with one tap."
		>
			<Button class="h-11 rounded-xl px-5" onclick={() => openSheet(null)}
				><PlusIcon />New scene</Button
			>
		</EmptyState>
	</div>
{:else}
	<ul
		class="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] md:gap-4"
	>
		{#each data.scenes as scene (scene.id)}
			<li class="glass flex flex-col gap-3 rounded-2xl p-4">
				<div class="flex items-start gap-3">
					<ItemMenu
						title={scene.name}
						class="min-w-0 flex-1"
						actions={[
							{
								label: "Edit",
								icon: PencilIcon,
								onSelect: () => openSheet(scene),
							},
							{
								label: "Delete",
								icon: Trash2Icon,
								destructive: true,
								form: {
									action: "?/remove",
									fields: { id: scene.id },
									loading: "Deleting",
									success: `${scene.name} deleted.`,
									confirm: {
										title: `Delete ${scene.name}?`,
										description:
											"Routines that set it report it as gone from then on.",
										confirmLabel: "Delete",
									},
								},
							},
						]}
					>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-semibold">{scene.name}</span>
							<span class="text-muted-foreground block text-sm"
								>{scene.members.length}
								{scene.members.length === 1 ? "device" : "devices"}</span
							>
						</span>
					</ItemMenu>
					<Button
						class="h-11 shrink-0 rounded-xl px-4"
						disabled={setting !== null}
						onclick={() => handleSetScene(scene)}
						>{#if setting === scene.id}<Spinner />{:else}<PlayIcon
							/>{/if}Set</Button
					>
				</div>
				<ul class="text-muted-foreground text-sm">
					{#each scene.members as member (member.deviceId)}
						<li>
							{describeCommand(
								member.command,
								names.get(member.deviceId) ?? "a removed device",
							)}
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>
{/if}

<Fab label="New scene" icon={PlusIcon} onclick={() => openSheet(null)} />

<SceneSheet
	bind:open={sheetOpen}
	{editing}
	devices={data.setup}
	states={data.states}
/>
