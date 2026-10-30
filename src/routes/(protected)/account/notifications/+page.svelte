<script lang="ts">
	import { deserialize, enhance } from "$app/forms";
	import { invalidateAll } from "$app/navigation";
	import BellIcon from "@lucide/svelte/icons/bell";
	import BellOffIcon from "@lucide/svelte/icons/bell-off";
	import BellRingIcon from "@lucide/svelte/icons/bell-ring";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SmartphoneIcon from "@lucide/svelte/icons/smartphone";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { describeTest } from "#lib/automations.js";
	import EmptyState from "#lib/components/empty-state.svelte";
	import ItemMenu from "#lib/components/item-menu.svelte";
	import RuleSheet from "#lib/components/notifications/rule-sheet.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { base64UrlBytes, deviceName } from "#lib/device-name.js";
	import { enhanceToast, toastError } from "#lib/toast.js";

	const { data } = $props();

	let support = $state<
		"checking" | "supported" | "install-first" | "unsupported"
	>("checking");
	let permission = $state<NotificationPermission>("default");
	let currentEndpoint = $state<string | null>(null);
	let pending = $state(false);
	let ruleOpen = $state(false);

	const ruleDeviceName = (deviceId: string) =>
		data.setup.find((device) => device.id === deviceId)?.name ??
		"A removed device";

	const thisDeviceOn = $derived(
		currentEndpoint !== null &&
			data.devices.some((device) => device.endpoint === currentEndpoint),
	);

	onMount(async () => {
		const standalone =
			matchMedia("(display-mode: standalone)").matches ||
			("standalone" in navigator && navigator.standalone === true);
		const apple = /iPhone|iPad/.test(navigator.userAgent);
		if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
			support = apple && !standalone ? "install-first" : "unsupported";
			return;
		}
		support = "supported";
		permission = Notification.permission;
		const registration = await navigator.serviceWorker.ready;
		currentEndpoint =
			(await registration.pushManager.getSubscription())?.endpoint ?? null;
	});

	async function post(action: string, fields: Record<string, string>) {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) {
			body.set(name, value);
		}
		const response = await fetch(`?/${action}`, {
			method: "POST",
			body,
			headers: { "x-sveltekit-action": "true" },
		});
		const result = deserialize(await response.text());
		if (result.type !== "success") {
			throw new Error(
				result.type === "failure"
					? String(result.data?.error ?? "That didn't work.")
					: "That didn't work.",
			);
		}
		await invalidateAll();
	}

	async function enableCallback() {
		pending = true;
		try {
			permission = await Notification.requestPermission();
			if (permission !== "granted") {
				throw new Error(
					"Notifications are blocked for LocalAssistant. Allow them in this browser's site settings.",
				);
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: base64UrlBytes(data.publicKey),
			});
			const { endpoint, keys } = subscription.toJSON();
			await post("subscribe", {
				endpoint: endpoint ?? "",
				p256dh: keys?.p256dh ?? "",
				auth: keys?.auth ?? "",
				device: deviceName(navigator.userAgent),
			});
			currentEndpoint = endpoint ?? null;
		} finally {
			pending = false;
		}
	}

	function handleEnable() {
		toast.promise(enableCallback(), {
			loading: "Turning notifications on",
			success: "Notifications are on for this device.",
			error: (error: unknown) =>
				toastError(error, "Notifications couldn't be turned on."),
		});
	}

	async function disableCallback() {
		pending = true;
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			if (subscription) {
				await post("unsubscribe", { endpoint: subscription.endpoint });
				await subscription.unsubscribe();
			}
			currentEndpoint = null;
		} finally {
			pending = false;
		}
	}

	function handleDisable() {
		toast.promise(disableCallback(), {
			loading: "Turning notifications off",
			success: "Notifications are off for this device.",
			error: (error: unknown) =>
				toastError(error, "Notifications couldn't be turned off."),
		});
	}
</script>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
	<section class="glass flex flex-col gap-4 rounded-2xl p-4 md:p-6">
		<div class="flex items-start gap-3">
			<span
				class="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
			>
				<BellIcon class="size-5" />
			</span>
			<div>
				<h2 class="font-semibold">This device</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					A notification on this device when LocalAssistant needs you.
				</p>
			</div>
		</div>
		{#if support === "install-first"}
			<p class="text-muted-foreground text-sm">
				On iPhone and iPad, notifications only work in the installed app: tap
				Share, then Add to Home Screen, and open LocalAssistant from there.
			</p>
		{:else if support === "unsupported"}
			<p class="text-muted-foreground text-sm">
				This browser can't receive notifications.
			</p>
		{:else if permission === "denied"}
			<p class="text-muted-foreground text-sm">
				Notifications are blocked for LocalAssistant in this browser. Allow them
				in its site settings, then come back.
			</p>
		{:else if support === "supported"}
			<div class="flex flex-wrap gap-3">
				{#if thisDeviceOn}
					<Button
						variant="outline"
						class="h-11 rounded-xl px-5"
						disabled={pending}
						onclick={handleDisable}
					>
						<BellOffIcon />
						Turn off
					</Button>
					<form
						method="POST"
						action="?/test"
						use:enhance={enhanceToast({
							loading: "Sending",
							success: "Sent. It should show up in a few seconds.",
						})}
					>
						<Button
							type="submit"
							variant="outline"
							class="h-11 rounded-xl px-5"
						>
							<BellRingIcon />
							Send a test
						</Button>
					</form>
				{:else}
					<Button
						class="glow h-11 rounded-xl px-5"
						disabled={pending}
						onclick={handleEnable}
					>
						<BellIcon />
						Turn on notifications
					</Button>
				{/if}
			</div>
		{/if}
	</section>

	<section class="flex flex-col gap-3" aria-labelledby="devices-heading">
		<h2 id="devices-heading" class="px-1 text-lg font-semibold">
			Your devices
		</h2>
		{#if data.devices.length === 0}
			<div class="glass rounded-2xl">
				<EmptyState
					icon={SmartphoneIcon}
					title="No device yet"
					subtitle="Turn notifications on from each phone or computer you want them on."
				/>
			</div>
		{:else}
			<ul class="glass divide-border divide-y overflow-hidden rounded-2xl">
				{#each data.devices as device (device.endpoint)}
					<li>
						<ItemMenu
							title={device.name}
							class="min-h-14 px-3 py-2 md:px-4"
							actions={[
								{
									label: "Remove",
									icon: Trash2Icon,
									destructive: true,
									form: {
										action: "?/unsubscribe",
										fields: { endpoint: device.endpoint },
										loading: "Removing device",
										success: `${device.name} won't get notifications anymore.`,
									},
								},
							]}
						>
							<SmartphoneIcon class="text-muted-foreground size-5 shrink-0" />
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-2">
									<span class="truncate font-medium">{device.name}</span>
									{#if device.endpoint === currentEndpoint}<Badge
											variant="secondary">This device</Badge
										>{/if}
								</span>
								<span class="text-muted-foreground block text-sm"
									>Since {new Date(device.createdAt).toLocaleDateString()}</span
								>
							</span>
						</ItemMenu>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
	<section
		class="flex flex-col gap-3 lg:col-span-2"
		aria-labelledby="rules-heading"
	>
		<div class="flex items-center justify-between gap-3">
			<div>
				<h2 id="rules-heading" class="font-semibold">Tell me when</h2>
				<p class="text-muted-foreground text-sm">
					Your own alerts: the washing machine is done, the garage opens, the
					freezer gets warm. Only you get them.
				</p>
			</div>
			<Button
				variant="outline"
				class="h-11 shrink-0 rounded-xl px-4"
				onclick={() => (ruleOpen = true)}><PlusIcon />Add</Button
			>
		</div>
		{#if data.rules.length > 0}
			<ul
				class="glass divide-border flex flex-col divide-y rounded-2xl px-4 md:px-6"
			>
				{#each data.rules as rule (rule.id)}
					<li class="flex min-h-14 items-center gap-3">
						<BellIcon class="text-muted-foreground size-4 shrink-0" />
						<span class="min-w-0 flex-1 text-sm"
							>{describeTest(rule.test, ruleDeviceName)}</span
						>
						<form
							method="POST"
							action="?/removeRule"
							use:enhance={enhanceToast({
								loading: "Removing",
								success: "You won't be told anymore.",
							})}
						>
							<input type="hidden" name="id" value={rule.id} />
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
	</section>
</div>

<RuleSheet bind:open={ruleOpen} devices={data.setup} />
