<script lang="ts">
	import { afterNavigate, refreshAll } from "$app/navigation";
	import { onMount } from "svelte";

	import { recheckDevices } from "#lib/remote/devices.remote.js";

	const everyMs = 30_000;
	const readWaitMs = 6_000;

	let offline = $state(true);

	async function recheck() {
		if (document.visibilityState !== "visible") {
			return;
		}
		try {
			const result = await recheckDevices();
			offline = result.offline > 0;
			if (result.queued) {
				setTimeout(() => {
					refreshAll().catch(() => undefined);
				}, readWaitMs);
			}
		} catch {
			offline = false;
		}
	}

	afterNavigate(() => {
		void recheck();
	});

	onMount(() => {
		const timer = setInterval(() => {
			if (offline) {
				void recheck();
			}
		}, everyMs);
		const onVisible = () => {
			if (document.visibilityState === "visible") {
				void recheck();
			}
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	});
</script>
