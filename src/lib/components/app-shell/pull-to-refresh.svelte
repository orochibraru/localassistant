<script lang="ts">
	import { refreshAll } from "$app/navigation";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { haptic } from "#lib/haptics.js";
	import { toastError } from "#lib/toast.js";

	const threshold = 72;
	const furthest = 120;

	let pull = $state(0);
	let refreshing = $state(false);
	let start = $state<{ x: number; y: number } | null>(null);
	let vertical: boolean | null = null;
	let armed = false;

	const progress = $derived(Math.min(pull / threshold, 1));

	function scrolledAncestor(target: EventTarget | null): boolean {
		for (
			let element = target instanceof Element ? target : null;
			element && element !== document.body;
			element = element.parentElement
		) {
			const overflow = getComputedStyle(element).overflowY;
			if (
				(overflow === "auto" || overflow === "scroll") &&
				element.scrollTop > 0
			) {
				return true;
			}
		}
		return false;
	}

	function blocked(event: TouchEvent): boolean {
		return (
			refreshing ||
			event.touches.length !== 1 ||
			window.scrollY > 0 ||
			!matchMedia("(max-width: 767px)").matches ||
			document.querySelector('[role="dialog"], [data-vaul-drawer]') !== null ||
			scrolledAncestor(event.target)
		);
	}

	function onStart(event: TouchEvent) {
		const touch = event.touches[0];
		start =
			touch && !blocked(event) ? { x: touch.clientX, y: touch.clientY } : null;
		vertical = null;
		armed = false;
	}

	function onMove(event: TouchEvent) {
		const touch = event.touches[0];
		if (!start || !touch) {
			return;
		}
		const dx = touch.clientX - start.x;
		const dy = touch.clientY - start.y;
		vertical ??= Math.abs(dy) > 6 ? Math.abs(dy) > Math.abs(dx) : null;
		if (vertical !== true || window.scrollY > 0) {
			pull = 0;
			return;
		}
		pull = Math.min(Math.max(dy, 0) * 0.5, furthest);
		if (pull >= threshold && !armed) {
			armed = true;
			haptic("tap");
		} else if (pull < threshold) {
			armed = false;
		}
	}

	async function refreshCallback() {
		refreshing = true;
		pull = threshold;
		try {
			await Promise.all([
				refreshAll(),
				new Promise((settle) => setTimeout(settle, 400)),
			]);
		} finally {
			refreshing = false;
			pull = 0;
		}
	}

	function onEnd() {
		const release = pull >= threshold;
		start = null;
		if (!release) {
			pull = 0;
			return;
		}
		refreshCallback().catch((failure: unknown) => {
			toast.error(toastError(failure, "Couldn't refresh. Try again."));
		});
	}

	onMount(() => {
		const options = { passive: true };
		document.addEventListener("touchstart", onStart, options);
		document.addEventListener("touchmove", onMove, options);
		document.addEventListener("touchend", onEnd, options);
		document.addEventListener("touchcancel", onEnd, options);
		return () => {
			document.removeEventListener("touchstart", onStart);
			document.removeEventListener("touchmove", onMove);
			document.removeEventListener("touchend", onEnd);
			document.removeEventListener("touchcancel", onEnd);
		};
	});
</script>

{#if pull > 0 || refreshing}
	<div
		class="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-30 flex justify-center md:hidden"
		style:transform="translateY({pull - 44}px)"
		style:transition={start ? "none" : "transform 200ms ease-out"}
		role="status"
		aria-live="polite"
	>
		<span
			class="bg-popover text-primary flex size-10 items-center justify-center rounded-full border shadow-md"
			style:opacity={refreshing ? 1 : progress}
		>
			{#if refreshing}
				<Spinner class="size-5" />
				<span class="sr-only">Refreshing</span>
			{:else}
				<RefreshCwIcon
					class="size-5"
					style="transform: rotate({progress * 270}deg)"
					aria-hidden="true"
				/>
			{/if}
		</span>
	</div>
{/if}
