<script lang="ts">
	import { onMount } from "svelte";

	import {
		readAppReport,
		rememberAppDevice,
		storedAppDevice,
	} from "#lib/app-device.js";
	import { reportAppDevice } from "#lib/remote/devices.remote.js";

	const reportEveryMs = 5 * 60_000;

	async function report() {
		const device = storedAppDevice();
		if (!device || document.visibilityState !== "visible") {
			return;
		}
		try {
			await reportAppDevice({
				deviceId: device.id,
				...(await readAppReport(device.shareLocation)),
			});
		} catch (failure) {
			if ((failure as { status?: number }).status === 404) {
				rememberAppDevice(null);
			}
		}
	}

	onMount(() => {
		void report();
		const timer = setInterval(() => void report(), reportEveryMs);
		const onVisible = () => void report();
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	});
</script>
