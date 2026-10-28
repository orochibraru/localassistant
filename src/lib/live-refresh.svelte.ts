import { invalidateAll } from "$app/navigation";
import { onMount } from "svelte";

/** A clock for "read 2 minutes ago" that ticks, and reloads the page's data, every 30 seconds while the page is visible. */
export class LiveRefresh {
	now = $state(Date.now());

	constructor(intervalMs = 30_000) {
		onMount(() => {
			const timer = setInterval(() => {
				if (document.visibilityState === "visible") {
					this.now = Date.now();
					void invalidateAll();
				}
			}, intervalMs);
			return () => clearInterval(timer);
		});
	}
}
