<script lang="ts">
	import { enhance } from "$app/forms";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PowerIcon from "@lucide/svelte/icons/power";
	import SearchIcon from "@lucide/svelte/icons/search";
	import StarIcon from "@lucide/svelte/icons/star";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import { pluginIconComponents } from "#lib/components/devices/device-kinds.js";
	import HealthBadge from "#lib/components/plugins/health-badge.svelte";
	import PluginPreview from "#lib/components/plugins/plugin-preview.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { setPageTitle } from "#lib/page-title.svelte.js";
	import type {
		PluginListing,
		PluginPreview as Preview,
	} from "#lib/plugins.js";
	import { browsePlugins, lookUpPlugin } from "#lib/remote/plugins.remote.js";
	import { useSheets } from "#lib/sheets.svelte.js";
	import { enhanceToast, toastError } from "#lib/toast.js";

	const { data } = $props();

	const sheets = useSheets();
	const listPath = resolve("/(protected)/integrations");

	setPageTitle("Add an integration", listPath);

	const connected = $derived(
		new Set(
			data.pluginSetups
				.filter((setup) => setup.connected)
				.map((setup) => setup.id),
		),
	);
	const ready = $derived(
		data.plugins.filter(
			(plugin) =>
				plugin.official &&
				plugin.devices === 0 &&
				!connected.has(plugin.id) &&
				plugin.loadError === null,
		),
	);
	let installedId: string | null = null;

	async function setUp(pluginId: string) {
		await goto(listPath);
		if (data.pluginSetups.some((setup) => setup.id === pluginId)) {
			sheets.addDevice = pluginId;
		}
	}

	let link = $state("");
	let looking = $state<string | null>(null);
	let lookError = $state<string | null>(null);
	let preview = $state<Preview | null>(null);
	let listings = $state<PluginListing[] | null>(null);
	let browsing = $state(false);
	let browseError = $state<string | null>(null);
	let tokenErrors = $state<Record<string, string[]>>({});

	async function lookUp(target: string) {
		looking = target;
		lookError = null;
		try {
			preview = await lookUpPlugin({ link: target });
		} catch (failure) {
			lookError = toastError(failure);
		} finally {
			looking = null;
		}
	}

	async function browse() {
		browsing = true;
		browseError = null;
		try {
			listings = await browsePlugins();
		} catch (failure) {
			browseError = toastError(failure);
		} finally {
			browsing = false;
		}
	}

	function closePreview() {
		preview = null;
		link = "";
	}

	async function installed() {
		const pluginId = installedId;
		installedId = null;
		if (pluginId) {
			closePreview();
			await setUp(pluginId);
		}
	}
</script>

<div
	class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:items-start"
>
	<section
		class="glass flex flex-col gap-2 rounded-2xl p-2"
		aria-labelledby="ready-heading"
	>
		<div class="px-2 pt-2">
			<h2 id="ready-heading" class="font-semibold">Ready to set up</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Ships with LocalAssistant. Pick one: it asks for what it needs, then
				shows up in Integrations with its devices.
			</p>
		</div>
		{#if ready.length === 0}
			<p class="text-muted-foreground px-2 pb-2 text-sm">
				Every built-in integration is set up.
			</p>
		{/if}
		<ul class="grid grid-cols-1 gap-1 2xl:grid-cols-2">
			{#each ready as plugin (plugin.id)}
				{@const Icon = pluginIconComponents[plugin.icon]}
				<li class="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2">
					<span
						class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
						aria-hidden="true"
					>
						<Icon class="size-5" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium">{plugin.name}</span>
						<span class="text-muted-foreground line-clamp-2 text-sm"
							>{plugin.description}</span
						>
					</span>
					{#if plugin.enabled}
						<Button
							variant="secondary"
							class="h-11 shrink-0 rounded-xl px-4"
							onclick={() => setUp(plugin.id)}><PlusIcon />Set up</Button
						>
					{:else}
						<form
							method="POST"
							action="{listPath}?/enable"
							use:enhance={enhanceToast({
								loading: "Turning it on",
								success: `${plugin.name} is on.`,
							})}
						>
							<input type="hidden" name="plugin" value={plugin.id} />
							<input type="hidden" name="enabled" value="true" />
							<Button
								type="submit"
								variant="outline"
								class="h-11 shrink-0 rounded-xl px-4"
								><PowerIcon />Turn on</Button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<div class="flex flex-col gap-6">
		<form
			class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6"
			onsubmit={(event) => {
				event.preventDefault();
				void lookUp(link);
			}}
		>
			<div>
				<h2 class="font-semibold">From a link</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Paste the link its author gave you, from GitHub, GitLab, Gitea,
					Forgejo or Codeberg, or a folder on this server. No account needed:
					you see what it adds and how maintained it is before installing.
				</p>
			</div>
			<Field.Field>
				<Field.Label for="plugin-link">Link</Field.Label>
				<Input
					id="plugin-link"
					bind:value={link}
					placeholder="github.com/someone/localassistant-something or /plugins/mine"
					inputmode="url"
					autocomplete="off"
					required
					class="h-11"
				/>
				{#if lookError}
					<Field.Error errors={[{ message: lookError }]} />
				{/if}
			</Field.Field>
			<Button
				type="submit"
				class="h-11 rounded-xl px-5"
				disabled={looking !== null}
				>{#if looking === link && link}<Spinner />{:else}<SearchIcon />{/if}Look
				it up</Button
			>
		</form>

		<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
			<div>
				<h2 class="font-semibold">Find integrations</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Community integrations on GitHub, GitLab and Codeberg, most liked
					first.
				</p>
			</div>
			{#if listings === null}
				<Button
					variant="outline"
					class="h-11 rounded-xl px-5"
					disabled={browsing}
					onclick={browse}
					>{#if browsing}<Spinner />{:else}<SearchIcon />{/if}Browse</Button
				>
			{/if}
			{#if browseError}
				<p class="text-destructive text-sm">{browseError}</p>
			{:else if listings?.length === 0}
				<p class="text-muted-foreground text-sm">
					None yet. Authors list theirs by tagging the repository
					localassistant-plugin.
				</p>
			{/if}
			{#if listings && listings.length > 0}
				<ul class="divide-border flex flex-col divide-y">
					{#each listings as listing (listing.repository)}
						<li class="flex items-center gap-3 py-3">
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium">{listing.name}</p>
								<p class="text-muted-foreground line-clamp-2 text-sm">
									{listing.description || listing.repository}
								</p>
								<div class="mt-1 flex flex-wrap items-center gap-2">
									<HealthBadge health={listing.health} />
									<span class="text-muted-foreground text-xs"
										>{listing.site}</span
									>
									<span
										class="text-muted-foreground inline-flex items-center gap-1 text-xs"
										><StarIcon class="size-3" />{listing.stars}</span
									>
									{#if listing.installed}<Badge variant="outline"
											>Installed</Badge
										>{/if}
								</div>
							</div>
							<Button
								variant="secondary"
								class="h-11 shrink-0 rounded-xl px-4"
								disabled={looking !== null}
								onclick={() => lookUp(listing.url)}
								>{#if looking === listing.url}<Spinner />{/if}Look</Button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<form
			method="POST"
			action="?/saveToken"
			class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6"
			use:enhance={enhanceToast({
				loading: "Checking the token with the site",
				success: (result) =>
					`Token saved for ${String(result?.saved ?? "the site")}. Its private integrations can be added now.`,
				reset: true,
				onFailure: (result) => {
					tokenErrors = (result?.errors as Record<string, string[]>) ?? {};
				},
				onSuccess: () => {
					tokenErrors = {};
				},
			})}
		>
			<div>
				<h2 class="font-semibold">Private integrations</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					For an integration in a private repository: a read-only access token
					from its site lets LocalAssistant download it. One token per site.
				</p>
			</div>
			<Field.Field>
				<Field.Label for="token-site">Site</Field.Label>
				<Input
					id="token-site"
					name="site"
					value="github.com"
					inputmode="url"
					autocomplete="off"
					required
					class="h-11"
				/>
				<Field.Description
					>github.com, gitlab.com, codeberg.org, or your own GitLab, Gitea or
					Forgejo address.</Field.Description
				>
				<Field.Error
					errors={tokenErrors.site?.map((message) => ({ message }))}
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label for="token-value">Token</Field.Label>
				<Input
					id="token-value"
					name="token"
					type="password"
					autocomplete="off"
					required
					class="h-11"
				/>
				<Field.Description
					>Stored encrypted. Saving one for a site that has a token replaces it.</Field.Description
				>
				<Field.Error
					errors={tokenErrors.token?.map((message) => ({ message }))}
				/>
			</Field.Field>
			<Button type="submit" class="h-11 self-start rounded-xl px-5"
				><KeyRoundIcon />Save the token</Button
			>
		</form>
		{#if data.tokenSites.length > 0}
			<ul
				class="glass divide-border flex flex-col divide-y rounded-2xl px-4 md:px-6"
				aria-label="Saved tokens"
			>
				{#each data.tokenSites as site (site)}
					<li class="flex min-h-14 items-center gap-3">
						<KeyRoundIcon class="text-muted-foreground size-4 shrink-0" />
						<span class="min-w-0 flex-1 truncate text-sm">{site}</span>
						<form
							method="POST"
							action="?/removeToken"
							use:enhance={enhanceToast({
								loading: "Removing the token",
								success: `Token for ${site} removed. Its private integrations stop updating.`,
							})}
						>
							<input type="hidden" name="site" value={site} />
							<Button
								type="submit"
								variant="ghost"
								class="text-destructive h-11 rounded-xl px-4"
								><Trash2Icon />Remove</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<PluginPreview
	{preview}
	onClose={closePreview}
	onInstalled={(pluginId) => (installedId = pluginId)}
	onComplete={installed}
/>
